import {
    and,
    asc,
    count,
    desc,
    eq,
    gte,
    inArray,
    like,
    lt,
    lte,
    ne,
    or,
    sql,
} from "drizzle-orm";
import {alias} from "drizzle-orm/sqlite-core";

import {db} from "@/db";
import {
    comments,
    departments,
    projects,
    tags,
    taskTags,
    tasks,
    users,
    workspaceMembers,
} from "@/db/schema";
import type {Task} from "@/db/schema";
import {ApiError} from "@/lib/api/http";
import {paginationMeta, type Pagination} from "@/lib/api/pagination";
import type {AuthUser} from "@/lib/auth/session";
import {
    getAccessibleWorkspaceIds,
    requireWorkspaceMember,
} from "@/lib/auth/guards";

const assignee = alias(users, "task_assignee");
const creator = alias(users, "task_creator");

const taskFields = {
    id: tasks.id,
    workspaceId: tasks.workspaceId,
    projectId: tasks.projectId,
    departmentId: tasks.departmentId,
    parentTaskId: tasks.parentTaskId,
    title: tasks.title,
    description: tasks.description,
    status: tasks.status,
    priority: tasks.priority,
    assigneeId: tasks.assigneeId,
    creatorId: tasks.creatorId,
    startDate: tasks.startDate,
    dueDate: tasks.dueDate,
    estimateMinutes: tasks.estimateMinutes,
    position: tasks.position,
    completedAt: tasks.completedAt,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
};

const taskJoins = {
    project: {
        id: projects.id,
        name: projects.name,
        key: projects.key,
        color: projects.color,
    },
    department: {
        id: departments.id,
        name: departments.name,
        slug: departments.slug,
        color: departments.color,
    },
    assignee: {
        id: assignee.id,
        name: assignee.name,
        email: assignee.email,
        avatarUrl: assignee.avatarUrl,
    },
    creator: {
        id: creator.id,
        name: creator.name,
        email: creator.email,
        avatarUrl: creator.avatarUrl,
    },
    commentCount: sql<number>`(
        select count(*) from comments
        where comments.task_id = ${tasks.id}
    )`,
    subtaskCount: sql<number>`(
        select count(*) from tasks as subtasks
        where subtasks.parent_task_id = ${tasks.id}
    )`,
};

export type TaskFilters = {
    workspaceId?: string;
    projectId?: string;
    departmentId?: string;
    assigneeId?: string;
    parentTaskId?: string;
    status?: Task["status"];
    priority?: Task["priority"];
    search?: string;
    due?: "overdue" | "today" | "week";
};

function baseTaskQuery() {
    return db
        .select(taskFields)
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .innerJoin(departments, eq(departments.id, tasks.departmentId))
        .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
        .leftJoin(creator, eq(creator.id, tasks.creatorId));
}

function taskDetailQuery() {
    return db
        .select({
            ...taskFields,
            ...taskJoins,
        })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .innerJoin(departments, eq(departments.id, tasks.departmentId))
        .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
        .leftJoin(creator, eq(creator.id, tasks.creatorId));
}

function buildTaskWhere(user: AuthUser, filters: TaskFilters) {
    const conditions = [];

    if (filters.workspaceId) {
        conditions.push(eq(tasks.workspaceId, filters.workspaceId));
    }
    if (filters.projectId) {
        conditions.push(eq(tasks.projectId, filters.projectId));
    }
    if (filters.departmentId) {
        conditions.push(eq(tasks.departmentId, filters.departmentId));
    }
    if (filters.assigneeId) {
        conditions.push(eq(tasks.assigneeId, filters.assigneeId));
    }
    if (filters.parentTaskId) {
        conditions.push(eq(tasks.parentTaskId, filters.parentTaskId));
    }
    if (filters.status) {
        conditions.push(eq(tasks.status, filters.status));
    }
    if (filters.priority) {
        conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters.search) {
        conditions.push(
            or(
                like(tasks.title, `%${filters.search}%`),
                like(tasks.description, `%${filters.search}%`),
            ),
        );
    }

    const now = new Date();
    if (filters.due === "overdue") {
        conditions.push(
            and(
                lt(tasks.dueDate, now),
                ne(tasks.status, "completed"),
            ),
        );
    }
    if (filters.due === "today") {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        conditions.push(
            and(gte(tasks.dueDate, start), lt(tasks.dueDate, end)),
        );
    }
    if (filters.due === "week") {
        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        conditions.push(
            and(gte(tasks.dueDate, now), lte(tasks.dueDate, end)),
        );
    }
    return conditions;
}

export async function listTasks(
    user: AuthUser,
    filters: TaskFilters,
    pagination: Pagination,
) {
    const workspaceIds = await getAccessibleWorkspaceIds(user);
    if (filters.workspaceId && !workspaceIds.includes(filters.workspaceId)) {
        throw new ApiError(403, "Workspace access denied", "FORBIDDEN");
    }

    const conditions = buildTaskWhere(user, filters);
    if (!filters.workspaceId) {
        conditions.push(inArray(tasks.workspaceId, workspaceIds));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
        baseTaskQuery()
            .where(where)
            .orderBy(asc(tasks.dueDate), desc(tasks.createdAt))
            .limit(pagination.limit)
            .offset(pagination.offset),
        db.select({value: count()}).from(tasks).where(where),
    ]);

    const taskIds = rows.map((row) => row.id);
    const tagRows = taskIds.length
        ? await db
              .select({
                  taskId: taskTags.taskId,
                  id: tags.id,
                  name: tags.name,
                  color: tags.color,
              })
              .from(taskTags)
              .innerJoin(tags, eq(tags.id, taskTags.tagId))
              .where(inArray(taskTags.taskId, taskIds))
        : [];

    const tagsByTask = new Map<
        string,
        Array<{id: string; name: string; color: string}>
    >();
    for (const row of tagRows) {
        const list = tagsByTask.get(row.taskId) ?? [];
        list.push({id: row.id, name: row.name, color: row.color});
        tagsByTask.set(row.taskId, list);
    }

    return {
        items: rows.map((row) => ({
            ...row,
            tags: tagsByTask.get(row.id) ?? [],
        })),
        pagination: paginationMeta(totalRows[0]?.value ?? 0, pagination),
    };
}

export async function getTaskDetail(id: string) {
    const [task] = await taskDetailQuery()
        .where(eq(tasks.id, id))
        .limit(1);

    if (!task) return null;

    const [taskTagRows, commentRows] = await Promise.all([
        db
            .select({
                id: tags.id,
                name: tags.name,
                color: tags.color,
            })
            .from(taskTags)
            .innerJoin(tags, eq(tags.id, taskTags.tagId))
            .where(eq(taskTags.taskId, id)),
        db
            .select({
                id: comments.id,
                body: comments.body,
                createdAt: comments.createdAt,
                author: {
                    id: users.id,
                    name: users.name,
                    avatarUrl: users.avatarUrl,
                },
            })
            .from(comments)
            .innerJoin(users, eq(users.id, comments.authorId))
            .where(eq(comments.taskId, id))
            .orderBy(asc(comments.createdAt)),
    ]);

    return {...task, tags: taskTagRows, comments: commentRows};
}

export async function requireTaskWorkspace(user: AuthUser, taskId: string) {
    const [task] = await db
        .select({workspaceId: tasks.workspaceId})
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

    if (!task) {
        throw new ApiError(404, "Task not found", "NOT_FOUND");
    }

    await requireWorkspaceMember(user, task.workspaceId);
    return task.workspaceId;
}

async function assertAssignee(workspaceId: string, assigneeId: string) {
    const [member] = await db
        .select({id: workspaceMembers.id})
        .from(workspaceMembers)
        .where(
            and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(workspaceMembers.userId, assigneeId),
            ),
        )
        .limit(1);

    if (!member) {
        throw new ApiError(
            400,
            "Assignee must be a member of the workspace",
            "INVALID_ASSIGNEE",
        );
    }
}

export async function createTask(
    user: AuthUser,
    input: {
        workspaceId?: string;
        projectId: string;
        departmentId?: string;
        parentTaskId?: string | null;
        title: string;
        description?: string | null;
        status?: Task["status"];
        priority?: Task["priority"];
        assigneeId?: string | null;
        startDate?: string | null;
        dueDate?: string | null;
        estimateMinutes?: number | null;
        position?: number;
        tagIds?: string[];
    },
) {
    const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

    if (!project) {
        throw new ApiError(404, "Project not found", "NOT_FOUND");
    }

    if (input.workspaceId && input.workspaceId !== project.workspaceId) {
        throw new ApiError(
            400,
            "Project does not belong to the selected workspace",
            "INVALID_RELATION",
        );
    }

    await requireWorkspaceMember(user, project.workspaceId);

    if (input.parentTaskId) {
        const [parent] = await db
            .select({workspaceId: tasks.workspaceId, projectId: tasks.projectId})
            .from(tasks)
            .where(eq(tasks.id, input.parentTaskId))
            .limit(1);
        if (!parent) {
            throw new ApiError(404, "Parent task not found", "NOT_FOUND");
        }
        if (parent.workspaceId !== project.workspaceId) {
            throw new ApiError(
                400,
                "Parent task belongs to another workspace",
                "INVALID_RELATION",
            );
        }
    }

    if (input.assigneeId) {
        await assertAssignee(project.workspaceId, input.assigneeId);
    }

    const status = input.status ?? "todo";
    const now = new Date();
    const [createdTask] = await db
        .insert(tasks)
        .values({
            workspaceId: project.workspaceId,
            projectId: project.id,
            departmentId: input.departmentId ?? project.departmentId,
            parentTaskId: input.parentTaskId ?? null,
            title: input.title,
            description: input.description ?? null,
            status,
            priority: input.priority ?? "medium",
            assigneeId: input.assigneeId ?? null,
            creatorId: user.id,
            startDate: input.startDate ? new Date(input.startDate) : null,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            estimateMinutes: input.estimateMinutes ?? null,
            position: input.position ?? 0,
            completedAt: status === "completed" ? now : null,
        })
        .returning({id: tasks.id});

    if (input.tagIds?.length) {
        const validTags = await db
            .select({id: tags.id})
            .from(tags)
            .where(
                and(
                    eq(tags.workspaceId, project.workspaceId),
                    inArray(tags.id, input.tagIds),
                ),
            );
        if (validTags.length !== input.tagIds.length) {
            throw new ApiError(
                400,
                "One or more tags do not belong to this workspace",
                "INVALID_RELATION",
            );
        }
        await db.insert(taskTags).values(
            validTags.map((tag) => ({taskId: createdTask.id, tagId: tag.id})),
        );
    }

    return getTaskDetail(createdTask.id);
}

export async function updateTask(
    user: AuthUser,
    taskId: string,
    input: {
        projectId?: string;
        departmentId?: string;
        parentTaskId?: string | null;
        title?: string;
        description?: string | null;
        status?: Task["status"];
        priority?: Task["priority"];
        assigneeId?: string | null;
        startDate?: string | null;
        dueDate?: string | null;
        estimateMinutes?: number | null;
        position?: number;
        tagIds?: string[];
    },
) {
    const [existing] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

    if (!existing) {
        throw new ApiError(404, "Task not found", "NOT_FOUND");
    }

    await requireWorkspaceMember(user, existing.workspaceId);

    if (input.assigneeId) {
        await assertAssignee(existing.workspaceId, input.assigneeId);
    }

    let projectId = existing.projectId;
    let departmentId = existing.departmentId;
    const workspaceId = existing.workspaceId;

    if (input.projectId && input.projectId !== existing.projectId) {
        const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, input.projectId))
            .limit(1);
        if (!project) {
            throw new ApiError(404, "Project not found", "NOT_FOUND");
        }
        if (project.workspaceId !== existing.workspaceId) {
            throw new ApiError(
                400,
                "Cannot move a task to another workspace",
                "INVALID_RELATION",
            );
        }
        projectId = project.id;
        departmentId = input.departmentId ?? project.departmentId;
    } else if (input.departmentId) {
        departmentId = input.departmentId;
    }

    if (input.parentTaskId) {
        const [parent] = await db
            .select({workspaceId: tasks.workspaceId})
            .from(tasks)
            .where(eq(tasks.id, input.parentTaskId))
            .limit(1);
        if (!parent) {
            throw new ApiError(404, "Parent task not found", "NOT_FOUND");
        }
        if (parent.workspaceId !== workspaceId) {
            throw new ApiError(
                400,
                "Parent task belongs to another workspace",
                "INVALID_RELATION",
            );
        }
    }

    const status = input.status ?? existing.status;
    const completedAt =
        status === "completed"
            ? existing.completedAt ?? new Date()
            : null;

    await db
        .update(tasks)
        .set({
            projectId,
            departmentId,
            parentTaskId:
                input.parentTaskId === undefined
                    ? existing.parentTaskId
                    : input.parentTaskId,
            title: input.title ?? existing.title,
            description:
                input.description === undefined
                    ? existing.description
                    : input.description,
            status,
            priority: input.priority ?? existing.priority,
            assigneeId:
                input.assigneeId === undefined
                    ? existing.assigneeId
                    : input.assigneeId,
            startDate:
                input.startDate === undefined
                    ? existing.startDate
                    : input.startDate
                      ? new Date(input.startDate)
                      : null,
            dueDate:
                input.dueDate === undefined
                    ? existing.dueDate
                    : input.dueDate
                      ? new Date(input.dueDate)
                      : null,
            estimateMinutes:
                input.estimateMinutes === undefined
                    ? existing.estimateMinutes
                    : input.estimateMinutes,
            position: input.position ?? existing.position,
            completedAt,
            updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

    if (input.tagIds) {
        const validTags = await db
            .select({id: tags.id})
            .from(tags)
            .where(
                and(
                    eq(tags.workspaceId, workspaceId),
                    inArray(tags.id, input.tagIds),
                ),
            );
        if (validTags.length !== input.tagIds.length) {
            throw new ApiError(
                400,
                "One or more tags do not belong to this workspace",
                "INVALID_RELATION",
            );
        }
        await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
        if (validTags.length) {
            await db.insert(taskTags).values(
                validTags.map((tag) => ({taskId, tagId: tag.id})),
            );
        }
    }

    return getTaskDetail(taskId);
}

export async function deleteTask(user: AuthUser, taskId: string) {
    await requireTaskWorkspace(user, taskId);
    await db.delete(tasks).where(eq(tasks.id, taskId));
}

export async function addComment(
    user: AuthUser,
    taskId: string,
    body: string,
) {
    await requireTaskWorkspace(user, taskId);
    const [comment] = await db
        .insert(comments)
        .values({taskId, authorId: user.id, body})
        .returning();

    return {
        ...comment,
        author: {
            id: user.id,
            name: user.name,
            avatarUrl: user.avatarUrl,
        },
    };
}
