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
import {
    requireTaskAccess,
    requireProjectAccess,
    taskScope,
    assertAssignable,
} from "@/lib/auth/scope";
import { taskCreateSchema, taskUpdateSchema } from "@/lib/api/schemas";
import type { z } from "zod";
import { notifyAssignment } from "./notifications";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/db";
import {
    comments,
    taskActivity,
    taskDependencies,
    timeEntries,
    departments,
    projects,
    tags,
    taskTags,
    tasks,
    users,
} from "@/db/schema";
import type { Task } from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { paginationMeta, type Pagination } from "@/lib/api/pagination";
import type { AuthUser } from "@/lib/auth/session";
import { getAccessibleWorkspaceIds } from "@/lib/auth/guards";

const assignee = alias(users, "task_assignee");
const creator = alias(users, "task_creator");

const taskFields = {
    id: tasks.id,
    workspaceId: tasks.workspaceId,
    projectId: tasks.projectId,
    departmentId: tasks.departmentId,
    parentTaskId: tasks.parentTaskId,
    archivedAt: tasks.archivedAt,
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
};

export type TaskFilters = {
    archived?: boolean;
    workspaceId?: string;
    projectId?: string;
    departmentId?: string;
    assigneeId?: string;
    parentTaskId?: string;
    status?: Task["status"];
    priority?: Task["priority"];
    search?: string;
    due?: "overdue" | "today" | "week";
    dueFrom?: string;
    dueTo?: string;
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
            and(lt(tasks.dueDate, now), ne(tasks.status, "completed")),
        );
    }
    if (filters.due === "today") {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        conditions.push(and(gte(tasks.dueDate, start), lt(tasks.dueDate, end)));
    }
    if (filters.due === "week") {
        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        conditions.push(and(gte(tasks.dueDate, now), lte(tasks.dueDate, end)));
    }
    if (filters.dueFrom) {
        conditions.push(gte(tasks.dueDate, new Date(filters.dueFrom)));
    }
    if (filters.dueTo) {
        conditions.push(lte(tasks.dueDate, new Date(filters.dueTo)));
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

    const conditions = [
        await taskScope(user, filters.workspaceId, filters.archived === true),
        ...buildTaskWhere(user, filters),
    ];
    if (filters.archived) conditions.push(sql`${tasks.archivedAt} IS NOT NULL`);
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
        db.select({ value: count() }).from(tasks).where(where),
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
        Array<{ id: string; name: string; color: string }>
    >();
    for (const row of tagRows) {
        const list = tagsByTask.get(row.taskId) ?? [];
        list.push({ id: row.id, name: row.name, color: row.color });
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

export async function getTaskDetail(id: string, user?: AuthUser) {
    const [task] = await taskDetailQuery().where(eq(tasks.id, id)).limit(1);

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

    const [subtasks] = await db
        .select({ value: count() })
        .from(tasks)
        .where(
            and(
                eq(tasks.parentTaskId, id),
                user ? await taskScope(user) : undefined,
            ),
        );
    return {
        ...task,
        subtaskCount: subtasks.value,
        tags: taskTagRows,
        comments: commentRows,
    };
}

export async function requireTaskWorkspace(user: AuthUser, taskId: string) {
    return (await requireTaskAccess(user, taskId)).workspaceId;
}

type Store = Pick<typeof db, "select" | "insert" | "update" | "delete">;
async function validateRelations(
    store: Store,
    workspaceId: string,
    projectId: string,
    input: {
        departmentId?: string;
        parentTaskId?: string | null;
        tagIds?: string[];
    },
    taskId?: string,
) {
    const [project] = await store
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
    if (!project || project.workspaceId !== workspaceId)
        throw new ApiError(
            400,
            "Project does not belong to workspace",
            "INVALID_RELATION",
        );
    if (input.departmentId && input.departmentId !== project.departmentId)
        throw new ApiError(
            400,
            "Department must match the project",
            "INVALID_RELATION",
        );
    if (input.parentTaskId) {
        let cursor: string | null = input.parentTaskId;
        const seen = new Set<string>(taskId ? [taskId] : []);
        while (cursor) {
            if (seen.has(cursor))
                throw new ApiError(
                    400,
                    "Subtask cycle is not allowed",
                    "TASK_CYCLE",
                );
            seen.add(cursor);
            const [parent] = await store
                .select()
                .from(tasks)
                .where(eq(tasks.id, cursor))
                .limit(1);
            if (!parent || parent.workspaceId !== workspaceId)
                throw new ApiError(
                    400,
                    "Invalid parent task",
                    "INVALID_RELATION",
                );
            cursor = parent.parentTaskId;
        }
    }
    const tagIds = [...new Set(input.tagIds ?? [])];
    if (tagIds.length) {
        const rows = await store
            .select({ id: tags.id })
            .from(tags)
            .where(
                and(
                    eq(tags.workspaceId, workspaceId),
                    inArray(tags.id, tagIds),
                ),
            );
        if (rows.length !== tagIds.length)
            throw new ApiError(
                400,
                "Tags must belong to the workspace",
                "INVALID_RELATION",
            );
    }
    return { project, tagIds };
}
function assertDates(start?: Date | null, due?: Date | null) {
    if (start && due && start > due)
        throw new ApiError(
            422,
            "Deadline must not be before the start",
            "INVALID_TIME_RANGE",
        );
}

export async function createTask(
    user: AuthUser,
    raw: z.infer<typeof taskCreateSchema>,
) {
    const input = taskCreateSchema.parse(raw);
    const project = await requireProjectAccess(user, input.projectId, true);
    if (input.workspaceId && input.workspaceId !== project.workspaceId)
        throw new ApiError(400, "Invalid workspace", "INVALID_RELATION");
    if (input.assigneeId)
        await assertAssignable(user, project.workspaceId, input.assigneeId);
    if (input.parentTaskId) await requireTaskAccess(user, input.parentTaskId);
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    assertDates(startDate, dueDate);
    const id = await db.transaction(async (tx) => {
        const { tagIds } = await validateRelations(
            tx,
            project.workspaceId,
            project.id,
            input,
        );
        const status = input.status ?? "todo";
        const [task] = await tx
            .insert(tasks)
            .values({
                ...input,
                workspaceId: project.workspaceId,
                projectId: project.id,
                departmentId: project.departmentId,
                creatorId: user.id,
                startDate,
                dueDate,
                completedAt: status === "completed" ? new Date() : null,
            })
            .returning();
        if (tagIds.length)
            await tx
                .insert(taskTags)
                .values(tagIds.map((tagId) => ({ taskId: task.id, tagId })));
        await tx
            .insert(taskActivity)
            .values({ taskId: task.id, actorId: user.id, action: "created" });
        await notifyAssignment(tx, task);
        return task.id;
    });
    return getTaskDetail(id, user);
}

export async function updateTask(
    user: AuthUser,
    taskId: string,
    raw: z.infer<typeof taskUpdateSchema>,
) {
    const input = taskUpdateSchema.parse(raw);
    const existing = await requireTaskAccess(user, taskId, true);
    if (input.projectId)
        await requireProjectAccess(user, input.projectId, true);
    if (input.assigneeId)
        await assertAssignable(user, existing.workspaceId, input.assigneeId);
    if (input.parentTaskId) await requireTaskAccess(user, input.parentTaskId);
    await db.transaction(async (tx) => {
        const [current] = await tx
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId));
        const { project, tagIds } = await validateRelations(
            tx,
            current.workspaceId,
            input.projectId ?? current.projectId,
            input,
            taskId,
        );
        const status = input.status ?? current.status;
        if (status === "completed" && current.status !== "completed") {
            const dependencies = await tx
                .select({ status: tasks.status })
                .from(taskDependencies)
                .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
                .where(eq(taskDependencies.taskId, taskId));
            if (dependencies.some((row) => row.status !== "completed"))
                throw new ApiError(
                    409,
                    "Complete blocking dependencies first",
                    "TASK_BLOCKED",
                );
        }
        const startDate =
            input.startDate === undefined
                ? current.startDate
                : input.startDate
                  ? new Date(input.startDate)
                  : null;
        const dueDate =
            input.dueDate === undefined
                ? current.dueDate
                : input.dueDate
                  ? new Date(input.dueDate)
                  : null;
        assertDates(startDate, dueDate);
        const { tagIds: ignoredTags, archived, ...fields } = input;
        void ignoredTags;
        const [updated] = await tx
            .update(tasks)
            .set({
                ...fields,
                projectId: project.id,
                departmentId: project.departmentId,
                startDate,
                dueDate,
                archivedAt:
                    archived === undefined
                        ? current.archivedAt
                        : archived
                          ? new Date()
                          : null,
                completedAt:
                    status === "completed"
                        ? (current.completedAt ?? new Date())
                        : null,
                updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
            .returning();
        if (input.tagIds !== undefined) {
            await tx.delete(taskTags).where(eq(taskTags.taskId, taskId));
            if (tagIds.length)
                await tx
                    .insert(taskTags)
                    .values(tagIds.map((tagId) => ({ taskId, tagId })));
        }
        if (status === "completed" || archived === true) {
            const running = await tx
                .select()
                .from(timeEntries)
                .where(
                    and(
                        eq(timeEntries.taskId, taskId),
                        sql`${timeEntries.endAt} IS NULL`,
                    ),
                );
            for (const entry of running)
                await tx
                    .update(timeEntries)
                    .set({
                        endAt: new Date(
                            Math.max(Date.now(), entry.startAt.getTime() + 1),
                        ),
                    })
                    .where(eq(timeEntries.id, entry.id));
        }
        await tx.insert(taskActivity).values({
            taskId,
            actorId: user.id,
            action:
                archived === undefined
                    ? "updated"
                    : archived
                      ? "archived"
                      : "restored",
            changes: JSON.stringify(input),
        });
        if (updated.assigneeId && updated.assigneeId !== current.assigneeId)
            await notifyAssignment(tx, updated);
    });
    return getTaskDetail(taskId, user);
}

export async function deleteTask(user: AuthUser, taskId: string) {
    await updateTask(user, taskId, { archived: true });
}

export async function addComment(user: AuthUser, taskId: string, body: string) {
    await requireTaskAccess(user, taskId, true);
    const [comment] = await db
        .insert(comments)
        .values({ taskId, authorId: user.id, body })
        .returning();
    return {
        ...comment,
        author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
    };
}
