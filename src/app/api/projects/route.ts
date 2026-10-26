import {and, asc, count, eq, inArray, like, or, sql} from "drizzle-orm";
import {alias} from "drizzle-orm/sqlite-core";

import {db} from "@/db";
import {departments, projects, users} from "@/db/schema";
import {
    ApiError,
    created,
    handleRoute,
    ok,
    parseBody,
    parseQuery,
} from "@/lib/api/http";
import {getPagination, paginationMeta} from "@/lib/api/pagination";
import {projectCreateSchema, projectListQuerySchema} from "@/lib/api/schemas";
import {
    getAccessibleWorkspaceIds,
    requireWorkspaceMember,
} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

const owner = alias(users, "project_owner");

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const query = await parseQuery(url, projectListQuerySchema);
        const pagination = getPagination(url);
        const workspaceIds = await getAccessibleWorkspaceIds(user);

        if (query.workspaceId && !workspaceIds.includes(query.workspaceId)) {
            throw new ApiError(403, "Workspace access denied", "FORBIDDEN");
        }

        const conditions = [];
        if (query.workspaceId) {
            conditions.push(eq(projects.workspaceId, query.workspaceId));
        } else {
            conditions.push(inArray(projects.workspaceId, workspaceIds));
        }
        if (query.departmentId) {
            conditions.push(eq(projects.departmentId, query.departmentId));
        }
        if (query.status) {
            conditions.push(eq(projects.status, query.status));
        }
        if (query.search) {
            conditions.push(
                or(
                    like(projects.name, `%${query.search}%`),
                    like(projects.key, `%${query.search}%`),
                ),
            );
        }
        const where = conditions.length ? and(...conditions) : undefined;

        const [items, totalRows] = await Promise.all([
            db
                .select({
                    id: projects.id,
                    workspaceId: projects.workspaceId,
                    departmentId: projects.departmentId,
                    name: projects.name,
                    key: projects.key,
                    description: projects.description,
                    color: projects.color,
                    status: projects.status,
                    ownerId: projects.ownerId,
                    startDate: projects.startDate,
                    dueDate: projects.dueDate,
                    createdAt: projects.createdAt,
                    updatedAt: projects.updatedAt,
                    department: {
                        id: departments.id,
                        name: departments.name,
                        slug: departments.slug,
                        color: departments.color,
                    },
                    owner: {
                        id: owner.id,
                        name: owner.name,
                        email: owner.email,
                        avatarUrl: owner.avatarUrl,
                    },
                    taskCount: sql<number>`(
                        select count(*) from tasks t
                        where t.project_id = ${projects.id}
                    )`,
                })
                .from(projects)
                .innerJoin(departments, eq(departments.id, projects.departmentId))
                .leftJoin(owner, eq(owner.id, projects.ownerId))
                .where(where)
                .orderBy(asc(projects.name))
                .limit(pagination.limit)
                .offset(pagination.offset),
            db.select({value: count()}).from(projects).where(where),
        ]);

        return ok({
            items,
            pagination: paginationMeta(totalRows[0]?.value ?? 0, pagination),
        });
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, projectCreateSchema);
        await requireWorkspaceMember(user, input.workspaceId);

        const [department] = await db
            .select({id: departments.id})
            .from(departments)
            .where(eq(departments.id, input.departmentId))
            .limit(1);

        if (!department) {
            throw new ApiError(404, "Department not found", "NOT_FOUND");
        }

        const [project] = await db
            .insert(projects)
            .values({
                workspaceId: input.workspaceId,
                departmentId: input.departmentId,
                name: input.name,
                key: input.key,
                description: input.description ?? null,
                color: input.color ?? "#4F46E5",
                status: input.status ?? "active",
                ownerId: input.ownerId ?? user.id,
                startDate: input.startDate ? new Date(input.startDate) : null,
                dueDate: input.dueDate ? new Date(input.dueDate) : null,
            })
            .returning();

        return created(project);
    });
}
