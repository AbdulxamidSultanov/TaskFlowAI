import { taskPermissions, requireTaskPermission } from "@/lib/auth/task-rights";
import {
    applyTaskWorkflow,
    initialReviewer,
    actionRecipient,
} from "./task-workflow";
import { taskActionRequests, notifications } from "@/db/schema";
import { userDayBounds } from "@/lib/time-zone";
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
    requiresReview: tasks.requiresReview,
    reviewerId: tasks.reviewerId,
    submittedAt: tasks.submittedAt,
    reviewedAt: tasks.reviewedAt,
    reviewedById: tasks.reviewedById,
    blockReason: tasks.blockReason,
    blockedAt: tasks.blockedAt,
    blockedById: tasks.blockedById,
    helperId: tasks.helperId,
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
            and(
                lt(tasks.dueDate, now),
                ne(tasks.status, "completed"),
                ne(tasks.status, "cancelled"),
            ),
        );
    }
    if (filters.due === "today") {
        const { start, end } = userDayBounds(now, user.timezone);
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
        items: await Promise.all(
            rows.map(async (row) => ({
                ...row,
                tags: tagsByTask.get(row.id) ?? [],
                permissions: await taskPermissions(user, row),
            })),
        ),
        pagination: paginationMeta(totalRows[0]?.value ?? 0, pagination),
    };
}

export async function getTaskDetail(id: string, user?: AuthUser) {
    const [task] = await taskDetailQuery().where(eq(tasks.id, id)).limit(1);

    if (!task) return null;
    if (user) await requireTaskAccess(user, id);

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

    const [helper] = task.helperId
        ? await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(eq(users.id, task.helperId))
        : [];
    const [blockedBy] = task.blockedById
        ? await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(eq(users.id, task.blockedById))
        : [];
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
        helper: helper ?? null,
        blockedBy: blockedBy ?? null,
        permissions: user ? await taskPermissions(user, task) : undefined,
        actionRequests: user
            ? await db
                  .select()
                  .from(taskActionRequests)
                  .where(
                      and(
                          eq(taskActionRequests.taskId, id),
                          eq(taskActionRequests.targetUserId, user.id),
                          sql`${taskActionRequests.resolvedAt} IS NULL`,
                      ),
                  )
            : [],
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
    if (
        input.status &&
        ["blocked", "under_review", "cancelled"].includes(input.status)
    )
        throw new ApiError(
            422,
            "Use the task workflow to set this status",
            "WORKFLOW_ACTION_REQUIRED",
        );
    if (input.requiresReview && input.status === "completed")
        throw new ApiError(
            422,
            "Submit the result for review first",
            "REVIEW_REQUIRED",
        );
    input.assigneeId ??= user.id;
    const project = await requireProjectAccess(user, input.projectId, true);
    if (input.workspaceId && input.workspaceId !== project.workspaceId)
        throw new ApiError(400, "Invalid workspace", "INVALID_RELATION");
    if (input.assigneeId)
        await assertAssignable(user, project.workspaceId, input.assigneeId);
    if (input.parentTaskId) await requireTaskAccess(user, input.parentTaskId);
    const startDate = input.startDate ? new Date(input.startDate) : null;
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    assertDates(startDate, dueDate);
    const reviewerId = input.requiresReview
        ? await initialReviewer(
              project.workspaceId,
              input.assigneeId,
              input.reviewerId,
          )
        : null;
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
                reviewerId,
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
    const { task: existing, permissions } = await requireTaskPermission(
        user,
        taskId,
        "view",
    );
    const needs = (key: keyof typeof permissions) => {
        if (!permissions[key])
            throw new ApiError(
                403,
                "This task action is not permitted",
                "FORBIDDEN",
            );
    };
    for (const key of Object.keys(input)) {
        if (
            [
                "assigneeId",
                "projectId",
                "departmentId",
                "parentTaskId",
            ].includes(key)
        )
            needs("assign");
        else if (["dueDate", "startDate"].includes(key))
            needs("changeDeadline");
        else if (["requiresReview", "reviewerId"].includes(key))
            needs("manageParticipants");
        else if (key === "archived") needs("delete");
        else if (key === "status") needs("status");
        else needs("edit");
    }
    if (
        input.status &&
        (input.status === "blocked" ||
            input.status === "under_review" ||
            input.status === "cancelled" ||
            (input.status === "completed" &&
                (input.requiresReview ?? existing.requiresReview)) ||
            existing.status === "blocked" ||
            existing.status === "under_review")
    ) {
        if (Object.keys(input).some((k) => k !== "status"))
            throw new ApiError(
                422,
                "Submit workflow actions separately",
                "WORKFLOW_ACTION_REQUIRED",
            );
        if (input.status === "blocked")
            throw new ApiError(
                422,
                "A block reason and helper are required",
                "REASON_REQUIRED",
            );
        const action =
            input.status === "cancelled"
                ? "cancel"
                : existing.status === "blocked" &&
                    input.status === "in_progress"
                  ? "unblock"
                  : input.status === "under_review" ||
                      input.status === "completed"
                    ? permissions.review && existing.status === "under_review"
                        ? "accept"
                        : "submit"
                    : null;
        if (!action)
            throw new ApiError(
                422,
                "Use the review or unblock action",
                "WORKFLOW_ACTION_REQUIRED",
            );
        await applyTaskWorkflow(user, taskId, { action });
        return getTaskDetail(taskId, user);
    }
    if (
        existing.status === "under_review" &&
        ((input.assigneeId !== undefined &&
            input.assigneeId !== existing.assigneeId) ||
            (input.reviewerId !== undefined &&
                input.reviewerId !== existing.reviewerId))
    )
        throw new ApiError(
            409,
            "Return the task for rework before changing its assignee or reviewer",
            "REVIEW_PENDING",
        );
    if (
        input.assigneeId &&
        input.assigneeId === existing.reviewerId &&
        !input.reviewerId
    )
        throw new ApiError(
            422,
            "Choose a different reviewer before reassigning the task",
            "INVALID_REVIEWER",
        );
    if (input.reviewerId) {
        if (input.reviewerId === (input.assigneeId ?? existing.assigneeId))
            throw new ApiError(
                422,
                "Assignee cannot review own work",
                "INVALID_REVIEWER",
            );
        await actionRecipient(input.reviewerId, taskId, "comment");
    }
    if (input.requiresReview === false && existing.status === "under_review")
        throw new ApiError(
            409,
            "Finish the pending review first",
            "REVIEW_PENDING",
        );
    if (
        input.requiresReview === true &&
        !input.reviewerId &&
        !existing.reviewerId
    )
        input.reviewerId = await initialReviewer(
            existing.workspaceId,
            input.assigneeId ?? existing.assigneeId,
        );

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
            if (
                dependencies.some(
                    (row) => !["completed", "cancelled"].includes(row.status),
                )
            )
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
        if (["completed", "cancelled"].includes(status) || archived === true) {
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
        if (
            input.dueDate !== undefined ||
            input.assigneeId !== undefined ||
            input.archived ||
            ["completed", "cancelled"].includes(updated.status)
        )
            await tx
                .delete(notifications)
                .where(
                    and(
                        eq(notifications.entityId, taskId),
                        eq(notifications.type, "task_due"),
                        sql`${notifications.readAt} IS NULL`,
                    ),
                );
        if (updated.assigneeId && updated.assigneeId !== current.assigneeId)
            await notifyAssignment(tx, updated);
    });
    return getTaskDetail(taskId, user);
}

export async function deleteTask(user: AuthUser, taskId: string) {
    await updateTask(user, taskId, { archived: true });
}

export async function addComment(user: AuthUser, taskId: string, body: string) {
    await requireTaskPermission(user, taskId, "comment");
    const [comment] = await db
        .insert(comments)
        .values({ taskId, authorId: user.id, body })
        .returning();
    return {
        ...comment,
        author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
    };
}
