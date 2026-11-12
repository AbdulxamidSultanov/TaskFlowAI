import { visibleUserIds, departmentScope } from "@/lib/auth/scope";
import { requireWorkspaceSupervisor } from "@/lib/auth/guards";
import { and, asc, count, eq, inArray, like, or } from "drizzle-orm";

import { db } from "@/db";
import {
    departments,
    userSettings,
    users,
    workspaceMembers,
} from "@/db/schema";
import {
    ApiError,
    created,
    handleRoute,
    ok,
    parseBody,
    parseQuery,
} from "@/lib/api/http";
import { getPagination, paginationMeta } from "@/lib/api/pagination";
import { userCreateSchema, userListQuerySchema } from "@/lib/api/schemas";
import { hashPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";

const safeUserFields = {
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    departmentId: users.departmentId,
    jobTitle: users.jobTitle,
    avatarUrl: users.avatarUrl,
    timezone: users.timezone,
    isActive: users.isActive,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    department: {
        id: departments.id,
        name: departments.name,
        slug: departments.slug,
        color: departments.color,
    },
};

export async function GET(request: Request) {
    return handleRoute(async () => {
        const actor = await requireUser();
        const url = new URL(request.url);
        const query = await parseQuery(url, userListQuerySchema);
        const pagination = getPagination(url);

        const conditions: Array<import("drizzle-orm").SQL | undefined> = [
            inArray(users.id, await visibleUserIds(actor, query.workspaceId)),
        ];
        if (query.departmentId) {
            conditions.push(eq(users.departmentId, query.departmentId));
        }
        if (query.role) {
            conditions.push(eq(users.role, query.role));
        }
        if (query.search) {
            conditions.push(
                or(
                    like(users.name, `%${query.search}%`),
                    like(users.email, `%${query.search}%`),
                ),
            );
        }
        const where = conditions.length ? and(...conditions) : undefined;

        const [items, totalRows] = await Promise.all([
            db
                .select(safeUserFields)
                .from(users)
                .leftJoin(departments, eq(departments.id, users.departmentId))
                .where(where)
                .orderBy(asc(users.name))
                .limit(pagination.limit)
                .offset(pagination.offset),
            db.select({ value: count() }).from(users).where(where),
        ]);

        return ok({
            items,
            pagination: paginationMeta(totalRows[0]?.value ?? 0, pagination),
        });
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const currentUser = await requireUser();

        const input = await parseBody(request, userCreateSchema);
        if (!input.workspaceId)
            throw new ApiError(
                422,
                "Workspace is required",
                "WORKSPACE_REQUIRED",
            );
        const membership = await requireWorkspaceSupervisor(
            currentUser,
            input.workspaceId,
        );

        if (
            currentUser.role !== "admin" &&
            input.role &&
            input.role !== "member"
        )
            throw new ApiError(
                403,
                "Only global admins can assign organization roles",
                "FORBIDDEN",
            );
        if (input.departmentId) {
            const [department] = await db
                .select()
                .from(departments)
                .where(
                    and(
                        eq(departments.id, input.departmentId),
                        await departmentScope(currentUser),
                    ),
                );
            if (!department || department.workspaceId !== input.workspaceId)
                throw new ApiError(
                    403,
                    "Department is outside workspace",
                    "FORBIDDEN",
                );
        }
        void membership;

        if (
            input.role &&
            currentUser.role !== "admin" &&
            input.role === "admin"
        ) {
            throw new ApiError(
                403,
                "Only admins can create admins",
                "FORBIDDEN",
            );
        }

        const user = await db.transaction(async (tx) => {
            const [user] = await tx
                .insert(users)
                .values({
                    name: input.name,
                    email: input.email,
                    passwordHash: await hashPassword(input.password),
                    role: input.role ?? "member",
                    departmentId: input.departmentId ?? null,
                    jobTitle: input.jobTitle ?? null,
                    avatarUrl: input.avatarUrl ?? null,
                    timezone: input.timezone ?? "Asia/Tashkent",
                })
                .returning({ id: users.id });

            await tx.insert(userSettings).values({ userId: user.id });
            await tx.insert(workspaceMembers).values({
                workspaceId: input.workspaceId!,
                userId: user.id,
                role: "member",
                managerUserId: currentUser.id,
            });

            return user;
        });

        const [createdUser] = await db
            .select(safeUserFields)
            .from(users)
            .leftJoin(departments, eq(departments.id, users.departmentId))
            .where(eq(users.id, user.id))
            .limit(1);

        return created(createdUser);
    });
}
