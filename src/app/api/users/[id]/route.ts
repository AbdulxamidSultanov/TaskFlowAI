import {count, eq} from "drizzle-orm";

import {db} from "@/db";
import {
    departments,
    tasks,
    userSettings,
    users,
    workspaceMembers,
    workspaces,
} from "@/db/schema";
import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import {userUpdateSchema} from "@/lib/api/schemas";
import {hashPassword} from "@/lib/auth/password";
import {requireRole, requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};

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

async function findUser(id: string) {
    const [user] = await db
        .select(safeUserFields)
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(eq(users.id, id))
        .limit(1);

    return user ?? null;
}

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const currentUser = await requireUser();
        const {id} = await params;

        if (currentUser.id !== id && !["admin", "manager"].includes(currentUser.role)) {
            throw new ApiError(403, "Insufficient permissions", "FORBIDDEN");
        }

        const user = await findUser(id);
        if (!user) {
            throw new ApiError(404, "User not found", "NOT_FOUND");
        }

        const [memberships, assigned, created, settings] = await Promise.all([
            db
                .select({
                    role: workspaceMembers.role,
                    joinedAt: workspaceMembers.joinedAt,
                    workspace: {
                        id: workspaces.id,
                        name: workspaces.name,
                        slug: workspaces.slug,
                        plan: workspaces.plan,
                    },
                })
                .from(workspaceMembers)
                .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
                .where(eq(workspaceMembers.userId, id)),
            db
                .select({value: count()})
                .from(tasks)
                .where(eq(tasks.assigneeId, id)),
            db
                .select({value: count()})
                .from(tasks)
                .where(eq(tasks.creatorId, id)),
            db
                .select()
                .from(userSettings)
                .where(eq(userSettings.userId, id))
                .limit(1),
        ]);

        return ok({
            ...user,
            stats: {
                assignedTasks: assigned[0]?.value ?? 0,
                createdTasks: created[0]?.value ?? 0,
            },
            memberships,
            settings: settings[0] ?? null,
        });
    });
}

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const currentUser = await requireUser();
        const {id} = await params;
        const input = await parseBody(request, userUpdateSchema);
        const isSelf = currentUser.id === id;
        const isAdmin = currentUser.role === "admin";

        if (!isSelf && !isAdmin) {
            throw new ApiError(403, "Insufficient permissions", "FORBIDDEN");
        }

        const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        if (!existing) {
            throw new ApiError(404, "User not found", "NOT_FOUND");
        }

        if (!isAdmin) {
            if (input.role !== undefined || input.isActive !== undefined) {
                throw new ApiError(
                    403,
                    "Only admins can change role or active status",
                    "FORBIDDEN",
                );
            }
            if (
                input.departmentId !== undefined &&
                input.departmentId !== existing.departmentId
            ) {
                throw new ApiError(
                    403,
                    "Only admins can change the department",
                    "FORBIDDEN",
                );
            }
        }

        const [updated] = await db
            .update(users)
            .set({
                ...(input.name === undefined ? {} : {name: input.name}),
                ...(input.email === undefined ? {} : {email: input.email}),
                ...(input.password === undefined
                    ? {}
                    : {passwordHash: await hashPassword(input.password)}),
                ...(input.role === undefined ? {} : {role: input.role}),
                ...(input.departmentId === undefined
                    ? {}
                    : {departmentId: input.departmentId}),
                ...(input.jobTitle === undefined
                    ? {}
                    : {jobTitle: input.jobTitle}),
                ...(input.avatarUrl === undefined
                    ? {}
                    : {avatarUrl: input.avatarUrl}),
                ...(input.timezone === undefined
                    ? {}
                    : {timezone: input.timezone}),
                ...(input.isActive === undefined
                    ? {}
                    : {isActive: input.isActive}),
                updatedAt: new Date(),
            })
            .where(eq(users.id, id))
            .returning({id: users.id});

        return ok(await findUser(updated.id));
    });
}

export async function DELETE(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const currentUser = await requireUser();
        requireRole(currentUser, ["admin"]);
        const {id} = await params;

        if (currentUser.id === id) {
            throw new ApiError(
                400,
                "You cannot delete your own account",
                "CANNOT_DELETE_SELF",
            );
        }

        const [existing] = await db
            .select({id: users.id})
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        if (!existing) {
            throw new ApiError(404, "User not found", "NOT_FOUND");
        }

        await db.delete(users).where(eq(users.id, id));
        return noContent();
    });
}
