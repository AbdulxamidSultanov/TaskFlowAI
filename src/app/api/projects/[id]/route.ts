import {eq, sql} from "drizzle-orm";
import {alias} from "drizzle-orm/sqlite-core";

import {db} from "@/db";
import {departments, projects, tasks, users} from "@/db/schema";
import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import {projectUpdateSchema} from "@/lib/api/schemas";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};
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

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
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
            .where(eq(tasks.projectId, id))
            .limit(100);

        return ok({...project, tasks: projectTasks});
    });
}

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const [project] = await db
            .select({workspaceId: projects.workspaceId})
            .from(projects)
            .where(eq(projects.id, id))
            .limit(1);

        if (!project) {
            throw new ApiError(404, "Project not found", "NOT_FOUND");
        }

        await requireWorkspaceMember(user, project.workspaceId);
        const input = await parseBody(request, projectUpdateSchema);

        if (input.departmentId) {
            const [department] = await db
                .select({id: departments.id})
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
                    : {departmentId: input.departmentId}),
                ...(input.name === undefined ? {} : {name: input.name}),
                ...(input.key === undefined ? {} : {key: input.key}),
                ...(input.description === undefined
                    ? {}
                    : {description: input.description}),
                ...(input.color === undefined ? {} : {color: input.color}),
                ...(input.status === undefined ? {} : {status: input.status}),
                ...(input.ownerId === undefined ? {} : {ownerId: input.ownerId}),
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

export async function DELETE(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const [project] = await db
            .select({workspaceId: projects.workspaceId})
            .from(projects)
            .where(eq(projects.id, id))
            .limit(1);

        if (!project) {
            throw new ApiError(404, "Project not found", "NOT_FOUND");
        }

        await requireWorkspaceMember(user, project.workspaceId);
        await db.delete(projects).where(eq(projects.id, id));
        return noContent();
    });
}
