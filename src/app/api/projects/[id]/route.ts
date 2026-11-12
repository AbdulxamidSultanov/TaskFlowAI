import {
    requireProjectAccess,
    taskScope,
    assertAssignable,
} from "@/lib/auth/scope";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/db";
import { departments, projects, tasks, users } from "@/db/schema";
import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import { projectUpdateSchema } from "@/lib/api/schemas";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };
const owner = alias(users, "project_owner");

const projectFields = {
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
        select count(*) from tasks t where t.project_id = ${projects.id}
    )`,
};

async function findProject(id: string) {
    const [project] = await db
        .select(projectFields)
        .from(projects)
        .innerJoin(departments, eq(departments.id, projects.departmentId))
        .leftJoin(owner, eq(owner.id, projects.ownerId))
        .where(eq(projects.id, id))
        .limit(1);

    return project ?? null;
}

export async function GET(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        await requireProjectAccess(user, id);
        const project = await findProject(id);

        if (!project) {
            throw new ApiError(404, "Project not found", "NOT_FOUND");
        }

        await requireWorkspaceMember(user, project.workspaceId, [
            "owner",
            "admin",
            "member",
            "viewer",
        ]);

        const projectTasks = await db
            .select({
                id: tasks.id,
                title: tasks.title,
                status: tasks.status,
                priority: tasks.priority,
                assigneeId: tasks.assigneeId,
                dueDate: tasks.dueDate,
            })
            .from(tasks)
            .where(and(eq(tasks.projectId, id), await taskScope(user)))
            .limit(100);

        return ok({
            ...project,
            taskCount: projectTasks.length,
            tasks: projectTasks,
        });
    });
}

export async function PATCH(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const [project] = await db
            .select({ workspaceId: projects.workspaceId })
            .from(projects)
            .where(eq(projects.id, id))
            .limit(1);

        if (!project) {
            throw new ApiError(404, "Project not found", "NOT_FOUND");
        }

        await requireProjectAccess(user, id, true);
        await requireWorkspaceMember(user, project.workspaceId, [
            "owner",
            "admin",
        ]);
        const input = await parseBody(request, projectUpdateSchema);
        const current = await requireProjectAccess(user, id, true);
        if (input.ownerId)
            await assertAssignable(user, current.workspaceId, input.ownerId);
        const start =
            input.startDate === undefined
                ? current.startDate
                : input.startDate
                  ? new Date(input.startDate)
                  : null;
        const due =
            input.dueDate === undefined
                ? current.dueDate
                : input.dueDate
                  ? new Date(input.dueDate)
                  : null;
        if (start && due && start > due)
            throw new ApiError(422, "Invalid date range", "INVALID_TIME_RANGE");
        if (input.departmentId && input.departmentId !== current.departmentId)
            throw new ApiError(
                409,
                "Move tasks before changing project department",
                "DEPARTMENT_LOCKED",
            );

        if (input.departmentId) {
            const [department] = await db
                .select({ id: departments.id })
                .from(departments)
                .where(eq(departments.id, input.departmentId))
                .limit(1);
            if (!department) {
                throw new ApiError(404, "Department not found", "NOT_FOUND");
            }
        }

        await db
            .update(projects)
            .set({
                ...(input.departmentId === undefined
                    ? {}
                    : { departmentId: input.departmentId }),
                ...(input.name === undefined ? {} : { name: input.name }),
                ...(input.key === undefined ? {} : { key: input.key }),
                ...(input.description === undefined
                    ? {}
                    : { description: input.description }),
                ...(input.color === undefined ? {} : { color: input.color }),
                ...(input.status === undefined ? {} : { status: input.status }),
                ...(input.ownerId === undefined
                    ? {}
                    : { ownerId: input.ownerId }),
                ...(input.startDate === undefined
                    ? {}
                    : {
                          startDate: input.startDate
                              ? new Date(input.startDate)
                              : null,
                      }),
                ...(input.dueDate === undefined
                    ? {}
                    : {
                          dueDate: input.dueDate
                              ? new Date(input.dueDate)
                              : null,
                      }),
                updatedAt: new Date(),
            })
            .where(eq(projects.id, id));

        return ok(await findProject(id));
    });
}

export async function DELETE(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const [project] = await db
            .select({ workspaceId: projects.workspaceId })
            .from(projects)
            .where(eq(projects.id, id))
            .limit(1);

        if (!project) {
            throw new ApiError(404, "Project not found", "NOT_FOUND");
        }

        await requireProjectAccess(user, id, true);
        await requireWorkspaceMember(user, project.workspaceId, [
            "owner",
            "admin",
        ]);
        await db
            .update(projects)
            .set({ status: "archived", updatedAt: new Date() })
            .where(eq(projects.id, id));
        return noContent();
    });
}
