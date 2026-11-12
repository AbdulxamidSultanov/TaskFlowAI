import { and, eq, inArray, isNull, or, sql, ne, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
    taskParticipants,
    departments,
    projects,
    tasks,
    users,
    workspaceMembers,
} from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { getAccessibleWorkspaceIds, requireWorkspaceMember } from "./guards";
import type { AuthUser } from "./session";

export async function workspaceScope(
    user: AuthUser,
    workspaceId: string,
): Promise<string[] | null> {
    const membership = await requireWorkspaceMember(user, workspaceId, [
        "owner",
        "admin",
        "member",
        "viewer",
    ]);
    if (membership.role === "owner" || membership.role === "admin") return null;
    const rows = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId));
    const own = rows.find((row) => row.userId === user.id);
    if (own?.accessScope === "workspace") return null;
    const ids = new Set([user.id]);
    if (own?.accessScope === "team") {
        let changed = true;
        while (changed) {
            changed = false;
            for (const row of rows)
                if (
                    row.managerUserId &&
                    ids.has(row.managerUserId) &&
                    !ids.has(row.userId)
                ) {
                    ids.add(row.userId);
                    changed = true;
                }
        }
    }
    return [...ids];
}

export async function visibleUserIds(user: AuthUser, workspaceId?: string) {
    const ids = workspaceId
        ? [workspaceId]
        : await getAccessibleWorkspaceIds(user);
    const visible = new Set([user.id]);
    for (const id of ids) {
        const scope = await workspaceScope(user, id);
        const rows =
            scope ??
            (
                await db
                    .select({ id: workspaceMembers.userId })
                    .from(workspaceMembers)
                    .where(eq(workspaceMembers.workspaceId, id))
            ).map((r) => r.id);
        rows.forEach((id) => visible.add(id));
    }
    return [...visible];
}

export async function taskScope(
    user: AuthUser,
    workspaceId?: string,
    includeArchived = false,
    includeParticipants = true,
): Promise<SQL> {
    const ids = workspaceId
        ? [workspaceId]
        : await getAccessibleWorkspaceIds(user);
    const branches: SQL[] = [];
    for (const id of ids) {
        const scope = await workspaceScope(user, id);
        branches.push(
            and(
                eq(tasks.workspaceId, id),
                scope === null
                    ? undefined
                    : or(
                          inArray(tasks.assigneeId, scope),
                          includeParticipants
                              ? inArray(
                                    tasks.id,
                                    db
                                        .select({ id: taskParticipants.taskId })
                                        .from(taskParticipants)
                                        .where(
                                            eq(
                                                taskParticipants.userId,
                                                user.id,
                                            ),
                                        ),
                                )
                              : undefined,
                      ),
            )!,
        );
    }
    return and(
        or(...branches) ?? sql`0`,
        includeArchived ? undefined : isNull(tasks.archivedAt),
    )!;
}

export async function projectScope(
    user: AuthUser,
    workspaceId?: string,
): Promise<SQL> {
    const ids = workspaceId
        ? [workspaceId]
        : await getAccessibleWorkspaceIds(user);
    const branches: SQL[] = [];
    for (const id of ids) {
        const scope = await workspaceScope(user, id);
        branches.push(
            and(
                eq(projects.workspaceId, id),
                scope === null
                    ? undefined
                    : or(
                          inArray(projects.ownerId, scope),
                          inArray(
                              projects.id,
                              db
                                  .select({ id: tasks.projectId })
                                  .from(tasks)
                                  .where(
                                      await taskScope(user, id, false, false),
                                  ),
                          ),
                      ),
            )!,
        );
    }
    return or(...branches) ?? sql`0`;
}

export async function departmentScope(user: AuthUser): Promise<SQL> {
    const ids = await getAccessibleWorkspaceIds(user);
    const people = await visibleUserIds(user);
    const all: string[] = [];
    for (const id of ids)
        if ((await workspaceScope(user, id)) === null) all.push(id);
    return (
        or(
            inArray(departments.workspaceId, all),
            inArray(
                departments.id,
                db
                    .select({ id: users.departmentId })
                    .from(users)
                    .where(inArray(users.id, people)),
            ),
        ) ?? sql`0`
    );
}

export async function requireTaskAccess(
    user: AuthUser,
    taskId: string,
    write = false,
) {
    const [task] = await db
        .select()
        .from(tasks)
        .where(
            and(eq(tasks.id, taskId), await taskScope(user, undefined, true)),
        )
        .limit(1);
    if (!task)
        throw new ApiError(
            404,
            "Task not found or outside your scope",
            "NOT_FOUND",
        );
    await requireWorkspaceMember(
        user,
        task.workspaceId,
        write
            ? ["owner", "admin", "member"]
            : ["owner", "admin", "member", "viewer"],
    );
    return task;
}

export async function requireProjectAccess(
    user: AuthUser,
    projectId: string,
    write = false,
) {
    const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), await projectScope(user)))
        .limit(1);
    if (!project)
        throw new ApiError(
            404,
            "Project not found or outside your scope",
            "NOT_FOUND",
        );
    await requireWorkspaceMember(
        user,
        project.workspaceId,
        write
            ? ["owner", "admin", "member"]
            : ["owner", "admin", "member", "viewer"],
    );
    return project;
}

export async function assertAssignable(
    user: AuthUser,
    workspaceId: string,
    assigneeId: string,
) {
    const scope = await workspaceScope(user, workspaceId);
    const [row] = await db
        .select({ id: users.id })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
            and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(users.id, assigneeId),
                eq(users.isActive, true),
                ne(workspaceMembers.role, "viewer"),
            ),
        )
        .limit(1);
    if (!row || (scope !== null && !scope.includes(assigneeId)))
        throw new ApiError(
            403,
            "Assignee is outside your scope",
            "ASSIGNEE_FORBIDDEN",
        );
}

export async function calendarScope(
    user: AuthUser,
    workspaceId?: string,
): Promise<SQL> {
    const { calendarEvents } = await import("@/db/schema");
    const ids = workspaceId
        ? [workspaceId]
        : await getAccessibleWorkspaceIds(user);
    const branches: SQL[] = [];
    for (const id of ids) {
        const scope = await workspaceScope(user, id);
        branches.push(
            and(
                eq(calendarEvents.workspaceId, id),
                scope === null
                    ? undefined
                    : or(
                          inArray(calendarEvents.createdById, scope),
                          inArray(
                              calendarEvents.taskId,
                              db
                                  .select({ id: tasks.id })
                                  .from(tasks)
                                  .where(await taskScope(user, id)),
                          ),
                      ),
            )!,
        );
    }
    return or(...branches) ?? sql`0`;
}

export async function assertCalendarRelations(
    user: AuthUser,
    workspaceId: string,
    input: {
        projectId?: string | null;
        taskId?: string | null;
        departmentId?: string | null;
    },
) {
    if (input.projectId) {
        const project = await requireProjectAccess(user, input.projectId);
        if (input.departmentId && input.departmentId !== project.departmentId)
            throw new ApiError(
                400,
                "Department must match project",
                "INVALID_RELATION",
            );
        if (project.workspaceId !== workspaceId)
            throw new ApiError(
                400,
                "Project outside workspace",
                "INVALID_RELATION",
            );
    }
    if (input.taskId) {
        const task = await requireTaskAccess(user, input.taskId);
        if (
            task.workspaceId !== workspaceId ||
            (input.projectId && task.projectId !== input.projectId)
        )
            throw new ApiError(
                400,
                "Task does not match workspace/project",
                "INVALID_RELATION",
            );
    }
    if (input.departmentId) {
        const [department] = await db
            .select()
            .from(departments)
            .where(
                and(
                    eq(departments.id, input.departmentId),
                    eq(departments.workspaceId, workspaceId),
                    await departmentScope(user),
                ),
            );
        if (!department)
            throw new ApiError(
                400,
                "Department outside scope",
                "INVALID_RELATION",
            );
    }
}
