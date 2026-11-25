import {
    taskScope,
    workspaceScope,
    visibleUserIds,
    projectScope,
    assertAssignable,
} from "@/lib/auth/scope";
import { notifyAssignment } from "@/lib/services/notifications";
import { updateTaskInTransaction } from "@/lib/services/task-service";
import { applyTaskWorkflowInTransaction } from "@/lib/services/task-workflow";
import { dateAtHour } from "@/lib/time-zone";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db, withDbRetry, type DbReader, type DbTransaction } from "@/db";
import {
    aiTaskDrafts,
    taskActivity,
    departments,
    projects,
    tasks,
    users,
    workspaceMembers,
} from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import type { AiTaskDraftUpdateInput } from "@/lib/api/schemas";
import {
    AI_PROPOSABLE_STATUSES,
    extractChatActions,
    generateStatusSuggestions,
    generateTaskDrafts,
    MAX_CHAT_ACTIONS,
    MAX_GENERATED_TASKS,
    MAX_GENERATOR_PROMPT,
    MAX_STATUS_SUGGESTIONS,
    type ChatActionContext,
    type GeneratorContext,
    type StatusReviewContext,
} from "@/lib/ai/task-generator";
import { randomUUID } from "node:crypto";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import type { AuthUser } from "@/lib/auth/session";

const editableRoles = ["owner", "admin", "member"] as const;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_DRAFTS = 30;

const draftFields = {
    id: aiTaskDrafts.id,
    workspaceId: aiTaskDrafts.workspaceId,
    userId: aiTaskDrafts.userId,
    batchId: aiTaskDrafts.batchId,
    projectId: aiTaskDrafts.projectId,
    departmentId: aiTaskDrafts.departmentId,
    title: aiTaskDrafts.title,
    description: aiTaskDrafts.description,
    priority: aiTaskDrafts.priority,
    suggestedDeadline: aiTaskDrafts.suggestedDeadline,
    suggestedAssigneeId: aiTaskDrafts.suggestedAssigneeId,
    estimateMinutes: aiTaskDrafts.estimateMinutes,
    actionType: aiTaskDrafts.actionType,
    targetTaskId: aiTaskDrafts.targetTaskId,
    suggestedStatus: aiTaskDrafts.suggestedStatus,
    suggestedReason: aiTaskDrafts.suggestedReason,
    state: aiTaskDrafts.state,
    publishedTaskId: aiTaskDrafts.publishedTaskId,
    createdAt: aiTaskDrafts.createdAt,
    updatedAt: aiTaskDrafts.updatedAt,
    project: {
        id: projects.id,
        name: projects.name,
        color: projects.color,
    },
    department: {
        id: departments.id,
        name: departments.name,
        color: departments.color,
    },
    assignee: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
    },
    task: {
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
    },
};

function draftQuery() {
    return db
        .select(draftFields)
        .from(aiTaskDrafts)
        .leftJoin(projects, eq(projects.id, aiTaskDrafts.projectId))
        .leftJoin(departments, eq(departments.id, aiTaskDrafts.departmentId))
        .leftJoin(users, eq(users.id, aiTaskDrafts.suggestedAssigneeId))
        .leftJoin(tasks, eq(tasks.id, aiTaskDrafts.targetTaskId));
}

export async function listDrafts(user: AuthUser, workspaceId: string) {
    await requireWorkspaceMember(user, workspaceId, [
        ...editableRoles,
        "viewer",
    ]);

    return draftQuery()
        .where(
            and(
                eq(aiTaskDrafts.workspaceId, workspaceId),
                eq(aiTaskDrafts.state, "draft"),
                or(isNull(aiTaskDrafts.targetTaskId), await taskScope(user, workspaceId)),
                (await workspaceScope(user, workspaceId)) === null
                    ? undefined
                    : inArray(
                          aiTaskDrafts.userId,
                          await visibleUserIds(user, workspaceId),
                      ),
            ),
        )
        .orderBy(desc(aiTaskDrafts.createdAt))
        .limit(50);
}

async function buildContext(
    user: AuthUser,
    workspaceId: string,
    prompt: string,
): Promise<GeneratorContext> {
    const projectRows = await db
        .select({
            id: projects.id,
            name: projects.name,
            key: projects.key,
            departmentId: projects.departmentId,
        })
        .from(projects)
        .where(
            and(
                eq(projects.workspaceId, workspaceId),
                await projectScope(user, workspaceId),
            ),
        )
        .limit(50);

    if (projectRows.length === 0) {
        throw new ApiError(
            422,
            "Сначала создайте проект: AI-задачам нужен проект публикации.",
            "NO_PROJECTS",
        );
    }

    const departmentIds = [...new Set(projectRows.map((p) => p.departmentId))];
    const departmentRows = await db
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .where(inArray(departments.id, departmentIds))
        .limit(50);

    const memberRows = await db
        .select({
            id: users.id,
            name: users.name,
            role: users.role,
            departmentId: users.departmentId,
            allocatedMinutes: sql<number>`(select coalesce(sum(estimate_minutes),0) from tasks where assignee_id=${users.id} and workspace_id=${workspaceId} and status not in ('completed','cancelled') and archived_at is null)`,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
            and(
                eq(workspaceMembers.workspaceId, workspaceId),
                inArray(users.id, await visibleUserIds(user, workspaceId)),
            ),
        )
        .limit(100);

    return {
        workspaceId,
        userId: user.id,
        prompt,
        today: new Intl.DateTimeFormat("en-CA", {
            timeZone: user.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date()),
        timezone: user.timezone,
        projects: projectRows,
        departments: departmentRows,
        members: memberRows,
    };
}

export async function generateDrafts(
    user: AuthUser,
    input: { workspaceId: string; prompt: string; projectId?: string | null },
) {
    await requireWorkspaceMember(user, input.workspaceId, [...editableRoles]);

    const recent = await db
        .select({ count: count() })
        .from(aiTaskDrafts)
        .where(
            and(
                eq(aiTaskDrafts.userId, user.id),
                gt(
                    aiTaskDrafts.createdAt,
                    new Date(Date.now() - RATE_WINDOW_MS),
                ),
            ),
        );

    if ((recent[0]?.count ?? 0) >= RATE_MAX_DRAFTS) {
        throw new ApiError(
            429,
            "Слишком много генераций. Подождите минуту и попробуйте снова.",
            "RATE_LIMITED",
        );
    }

    const prompt = input.prompt.trim().slice(0, MAX_GENERATOR_PROMPT);
    const context = await buildContext(user, input.workspaceId, prompt);

    if (input.projectId) {
        const project = context.projects.find((p) => p.id === input.projectId);
        if (!project) {
            throw new ApiError(
                403,
                "Проект недоступен в этом рабочем пространстве.",
                "PROJECT_FORBIDDEN",
            );
        }
        context.projects = [project];
    }

    const generated = await generateTaskDrafts(context);

    const existingTitles = await db
        .select({ title: tasks.title })
        .from(tasks)
        .where(await taskScope(user, input.workspaceId));
    const existingDrafts = await db
        .select({ title: aiTaskDrafts.title })
        .from(aiTaskDrafts)
        .where(
            and(
                eq(aiTaskDrafts.workspaceId, input.workspaceId),
                eq(aiTaskDrafts.userId, user.id),
                eq(aiTaskDrafts.state, "draft"),
            ),
        );
    const known = new Set(
        [...existingTitles, ...existingDrafts].map((row) =>
            row.title.trim().toLowerCase(),
        ),
    );
    const suggestions = generated.tasks.filter((task) => {
        const key = task.title.trim().toLowerCase();
        if (known.has(key)) return false;
        known.add(key);
        return true;
    });
    if (!suggestions.length)
        throw new ApiError(
            422,
            "Similar tasks already exist in your scope; refine the request",
            "NO_NEW_TASKS",
        );
    const rows = suggestions.slice(0, MAX_GENERATED_TASKS).map((task) => ({
        workspaceId: input.workspaceId,
        userId: user.id,
        batchId: generated.batchId,
        projectId: task.projectId,
        departmentId: task.departmentId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        suggestedDeadline: task.suggestedDeadline,
        suggestedAssigneeId: task.suggestedAssigneeId,
        estimateMinutes: task.estimateMinutes,
        generationMode: generated.mode,
        generationModel: generated.model,
    }));

    await db.transaction(async (tx) => {
        const [recent] = await tx
            .select({ count: count() })
            .from(aiTaskDrafts)
            .where(
                and(
                    eq(aiTaskDrafts.userId, user.id),
                    gt(
                        aiTaskDrafts.createdAt,
                        new Date(Date.now() - RATE_WINDOW_MS),
                    ),
                ),
            );
        if (recent.count + rows.length > RATE_MAX_DRAFTS)
            throw new ApiError(
                429,
                "Draft quota exceeded; retry in one minute",
                "RATE_LIMITED",
            );
        await tx.insert(aiTaskDrafts).values(rows);
    });

    const drafts = await draftQuery()
        .where(
            and(
                eq(aiTaskDrafts.batchId, generated.batchId),
                eq(aiTaskDrafts.state, "draft"),
            ),
        )
        .orderBy(desc(aiTaskDrafts.createdAt));

    return {
        batchId: generated.batchId,
        mode: generated.mode,
        model: generated.model,
        tasks: drafts,
    };
}

export async function generateStatusReview(
    user: AuthUser,
    input: { workspaceId: string },
) {
    await requireWorkspaceMember(user, input.workspaceId, [...editableRoles]);

    // Same rolling draft quota as task generation (pre-check).
    const recent = await db
        .select({ count: count() })
        .from(aiTaskDrafts)
        .where(
            and(
                eq(aiTaskDrafts.userId, user.id),
                gt(
                    aiTaskDrafts.createdAt,
                    new Date(Date.now() - RATE_WINDOW_MS),
                ),
            ),
        );
    if ((recent[0]?.count ?? 0) >= RATE_MAX_DRAFTS) {
        throw new ApiError(
            429,
            "Слишком много генераций. Подождите минуту и попробуйте снова.",
            "RATE_LIMITED",
        );
    }

    const taskRows = await db
        .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            requiresReview: tasks.requiresReview,
            dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(
            and(
                await taskScope(user, input.workspaceId),
                ne(tasks.status, "completed"),
                ne(tasks.status, "cancelled"),
            ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(30);

    if (taskRows.length === 0) {
        throw new ApiError(
            422,
            "Нет открытых задач в вашей области видимости для ревизии статусов.",
            "NO_OPEN_TASKS",
        );
    }

    const context: StatusReviewContext = {
        workspaceId: input.workspaceId,
        userId: user.id,
        today: new Intl.DateTimeFormat("en-CA", {
            timeZone: user.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date()),
        timezone: user.timezone,
        tasks: taskRows.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            requiresReview: task.requiresReview,
            dueDate: task.dueDate
                ? task.dueDate.toISOString().slice(0, 10)
                : null,
        })),
    };

    const review = await generateStatusSuggestions(context);

    // Do not duplicate an identical pending proposal for the same task+status.
    const existingProposals = await db
        .select({
            targetTaskId: aiTaskDrafts.targetTaskId,
            suggestedStatus: aiTaskDrafts.suggestedStatus,
        })
        .from(aiTaskDrafts)
        .where(
            and(
                eq(aiTaskDrafts.workspaceId, input.workspaceId),
                eq(aiTaskDrafts.state, "draft"),
                eq(aiTaskDrafts.actionType, "update_status"),
            ),
        );
    const proposed = new Set(
        existingProposals.map(
            (row) => `${row.targetTaskId}:${row.suggestedStatus}`,
        ),
    );
    const taskMap = new Map(taskRows.map((task) => [task.id, task]));

    const rows: Array<typeof aiTaskDrafts.$inferInsert> = [];
    const seen = new Set<string>();
    for (const suggestion of review.suggestions.slice(0, MAX_STATUS_SUGGESTIONS)) {
        const task = taskMap.get(suggestion.taskId);
        if (!task) continue;
        const status = suggestion.suggestedStatus;
        if (task.status === status) continue;
        // Workflow-governed transitions are never proposed by the AI.
        if (status === "completed" && task.requiresReview) continue;
        if (status === "blocked" && suggestion.reason.trim().length < 3) {
            continue;
        }
        const key = `${task.id}:${status}`;
        if (proposed.has(key) || seen.has(key)) continue;
        seen.add(key);
        rows.push({
            workspaceId: input.workspaceId,
            userId: user.id,
            batchId: review.batchId,
            actionType: "update_status",
            targetTaskId: task.id,
            title: task.title,
            suggestedStatus: status,
            suggestedReason: suggestion.reason,
            generationMode: review.mode,
            generationModel: review.model,
        });
    }

    if (rows.length === 0) {
        throw new ApiError(
            422,
            "AI не предложил применимых изменений статусов.",
            "NO_STATUS_SUGGESTIONS",
        );
    }

    await db.transaction(async (tx) => {
        const [txRecent] = await tx
            .select({ count: count() })
            .from(aiTaskDrafts)
            .where(
                and(
                    eq(aiTaskDrafts.userId, user.id),
                    gt(
                        aiTaskDrafts.createdAt,
                        new Date(Date.now() - RATE_WINDOW_MS),
                    ),
                ),
            );
        if (txRecent.count + rows.length > RATE_MAX_DRAFTS)
            throw new ApiError(
                429,
                "Draft quota exceeded; retry in one minute",
                "RATE_LIMITED",
            );
        await tx.insert(aiTaskDrafts).values(rows);
    });

    const drafts = await draftQuery()
        .where(
            and(
                eq(aiTaskDrafts.batchId, review.batchId),
                eq(aiTaskDrafts.state, "draft"),
            ),
        )
        .orderBy(desc(aiTaskDrafts.createdAt));

    return {
        batchId: review.batchId,
        mode: review.mode,
        model: review.model,
        tasks: drafts,
    };
}

export async function proposeChatActions(
    user: AuthUser,
    input: {
        workspaceId: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        existingOnly?: boolean;
    },
) {
    await requireWorkspaceMember(user, input.workspaceId, [...editableRoles]);

    // Share the rolling draft quota with task generation and status review.
    const recent = await db
        .select({ count: count() })
        .from(aiTaskDrafts)
        .where(
            and(
                eq(aiTaskDrafts.userId, user.id),
                gt(
                    aiTaskDrafts.createdAt,
                    new Date(Date.now() - RATE_WINDOW_MS),
                ),
            ),
        );
    if ((recent[0]?.count ?? 0) >= RATE_MAX_DRAFTS) {
        throw new ApiError(429, "Draft quota exceeded", "RATE_LIMITED");
    }

    const scope = await taskScope(user, input.workspaceId);
    const taskRows = await db
        .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            requiresReview: tasks.requiresReview,
            dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(and(scope, ne(tasks.status, "cancelled")))
        .orderBy(asc(tasks.dueDate))
        .limit(30);

    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: user.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

    const context: ChatActionContext = {
        workspaceId: input.workspaceId,
        userId: user.id,
        today,
        timezone: user.timezone,
        existingOnly: input.existingOnly,
        tasks: taskRows.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            requiresReview: task.requiresReview,
            dueDate: task.dueDate
                ? task.dueDate.toISOString().slice(0, 10)
                : null,
        })),
        messages: input.messages
            .slice(-10)
            .map((message) => ({
                role: message.role,
                content: message.content.slice(0, 2000),
            })),
    };

    const extraction = await extractChatActions(context);
    const batchId = randomUUID();
    const taskMap = new Map(taskRows.map((task) => [task.id, task]));

    let fallbackProject: { id: string; departmentId: string } | undefined;
    if (!input.existingOnly && extraction.actions.some((action) => action.action === "create_task")) {
        const projectRows = await db
            .select({ id: projects.id, departmentId: projects.departmentId })
            .from(projects)
            .where(
                and(
                    eq(projects.workspaceId, input.workspaceId),
                    await projectScope(user, input.workspaceId),
                ),
            )
            .limit(50);
        fallbackProject = projectRows[0];
    }

    const existingTasks = fallbackProject
        ? await db.select({ title: tasks.title }).from(tasks).where(scope)
        : [];
    const existingTitles = new Set(existingTasks.map((row) => row.title.trim().toLowerCase()));

    const rows: Array<typeof aiTaskDrafts.$inferInsert> = [];
    const seen = new Set<string>();

    for (const action of extraction.actions.slice(0, MAX_CHAT_ACTIONS)) {
        if (action.action === "update_status") {
            if (!action.taskId || !action.status) continue;
            const task = taskMap.get(action.taskId);
            if (!task || task.status === action.status) continue;
            if (action.status === "completed" && task.requiresReview) continue;
            const reason = (action.reason ?? "").trim();
            if (action.status === "blocked" && reason.length < 3) continue;
            const key = `update_status:${task.id}:${action.status}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({
                workspaceId: input.workspaceId,
                userId: user.id,
                batchId,
                actionType: "update_status",
                targetTaskId: task.id,
                title: task.title,
                suggestedStatus: action.status,
                suggestedReason: reason || null,
                generationMode: extraction.mode,
                generationModel: extraction.model,
            });
        } else if (action.action === "update_deadline") {
            if (!action.taskId || !action.deadline) continue;
            const task = taskMap.get(action.taskId);
            if (!task || !/^\d{4}-\d{2}-\d{2}$/.test(action.deadline)) {
                continue;
            }
            const maxDate = new Date(`${today}T00:00:00Z`);
            maxDate.setUTCDate(maxDate.getUTCDate() + 365);
            if (
                action.deadline < today ||
                action.deadline > maxDate.toISOString().slice(0, 10)
            ) {
                continue;
            }
            let deadline: Date | null = null;
            try {
                deadline = dateAtHour(
                    action.deadline,
                    context.timezone ?? "UTC",
                );
            } catch {
                continue;
            }
            if (
                task.dueDate &&
                task.dueDate.getTime() === deadline.getTime()
            ) {
                continue;
            }
            const key = `update_deadline:${task.id}:${action.deadline}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({
                workspaceId: input.workspaceId,
                userId: user.id,
                batchId,
                actionType: "update_deadline",
                targetTaskId: task.id,
                title: task.title,
                suggestedDeadline: deadline,
                suggestedReason: (action.reason ?? "").trim() || null,
                generationMode: extraction.mode,
                generationModel: extraction.model,
            });
        } else if (action.action === "create_task") {
            const newTask = action.newTask;
            if (!newTask || !fallbackProject) continue;
            const title = newTask.title.trim();
            if (title.length < 2) continue;
            const titleKey = `create:${title.toLowerCase()}`;
            if (existingTitles.has(titleKey.slice(7)) || seen.has(titleKey)) {
                continue;
            }
            seen.add(titleKey);
            let deadline: Date | null = null;
            if (newTask.deadline && /^\d{4}-\d{2}-\d{2}$/.test(newTask.deadline)) {
                try {
                    deadline = dateAtHour(
                        newTask.deadline,
                        context.timezone ?? "UTC",
                    );
                } catch {
                    deadline = null;
                }
            }
            rows.push({
                workspaceId: input.workspaceId,
                userId: user.id,
                batchId,
                actionType: "create_task",
                projectId: fallbackProject.id,
                departmentId: fallbackProject.departmentId,
                title: title.slice(0, 240),
                description: (newTask.description ?? "").trim().slice(0, 2000) || null,
                priority: newTask.priority ?? "medium",
                suggestedDeadline: deadline,
                generationMode: extraction.mode,
                generationModel: extraction.model,
            });
        }
    }

    if (rows.length === 0) {
        return { batchId: null, mode: extraction.mode, model: extraction.model, drafts: [] };
    }

    const inserted = await withDbRetry(() => db.transaction(async (tx) => {
        await requireWorkspaceMember(user, input.workspaceId, [...editableRoles], tx);
        const pendingRows = await tx
            .select({
                actionType: aiTaskDrafts.actionType,
                targetTaskId: aiTaskDrafts.targetTaskId,
                suggestedStatus: aiTaskDrafts.suggestedStatus,
                suggestedDeadline: aiTaskDrafts.suggestedDeadline,
            })
            .from(aiTaskDrafts)
            .where(
                and(
                    eq(aiTaskDrafts.workspaceId, input.workspaceId),
                    eq(aiTaskDrafts.state, "draft"),
                    inArray(aiTaskDrafts.actionType, [
                        "update_status",
                        "update_deadline",
                    ]),
                ),
            );
        const newRows = rows.filter((row) => !pendingRows.some((pending) =>
            pending.actionType === row.actionType &&
            pending.targetTaskId === row.targetTaskId &&
            (row.actionType === "update_status"
                ? pending.suggestedStatus === row.suggestedStatus
                : pending.suggestedDeadline?.getTime() === row.suggestedDeadline?.getTime()),
        ));
        if (newRows.length === 0) return false;
        const [txRecent] = await tx
            .select({ count: count() })
            .from(aiTaskDrafts)
            .where(
                and(
                    eq(aiTaskDrafts.userId, user.id),
                    gt(
                        aiTaskDrafts.createdAt,
                        new Date(Date.now() - RATE_WINDOW_MS),
                    ),
                ),
            );
        if (txRecent.count + newRows.length > RATE_MAX_DRAFTS)
            throw new ApiError(
                429,
                "Draft quota exceeded; retry in one minute",
                "RATE_LIMITED",
            );
        await tx.insert(aiTaskDrafts).values(newRows);
        return true;
    }), "proposeChatActions");

    if (!inserted) {
        return { batchId: null, mode: extraction.mode, model: extraction.model, drafts: [] };
    }

    const drafts = await draftQuery()
        .where(
            and(
                eq(aiTaskDrafts.batchId, batchId),
                eq(aiTaskDrafts.state, "draft"),
            ),
        )
        .orderBy(desc(aiTaskDrafts.createdAt));

    return { batchId, mode: extraction.mode, model: extraction.model, drafts };
}

async function loadDraft(user: AuthUser, draftId: string, store: DbReader = db) {
    const [draft] = await store
        .select()
        .from(aiTaskDrafts)
        .where(eq(aiTaskDrafts.id, draftId))
        .limit(1);

    if (!draft) {
        throw new ApiError(404, "Черновик не найден", "NOT_FOUND");
    }

    const membership = await requireWorkspaceMember(user, draft.workspaceId, [...editableRoles], store);

    if (
        draft.userId !== user.id &&
        membership.role !== "owner" &&
        membership.role !== "admin"
    ) {
        throw new ApiError(
            403,
            "Редактировать может автор или администратор workspace.",
            "FORBIDDEN",
        );
    }

    const scope = await workspaceScope(user, draft.workspaceId, store);
    if (scope !== null && !scope.includes(draft.userId))
        throw new ApiError(403, "Draft outside your scope", "FORBIDDEN");
    return draft;
}

export async function updateDraft(
    user: AuthUser,
    draftId: string,
    input: AiTaskDraftUpdateInput,
) {
    const draft = await loadDraft(user, draftId);
    if (draft.state !== "draft") {
        throw new ApiError(
            409,
            "Опубликованный или отклонённый черновик нельзя изменить.",
            "DRAFT_LOCKED",
        );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) {
        patch.description = input.description || null;
    }
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.estimateMinutes !== undefined) {
        patch.estimateMinutes = input.estimateMinutes;
    }

    if (input.suggestedStatus !== undefined) {
        if (!(AI_PROPOSABLE_STATUSES as readonly string[]).includes(input.suggestedStatus)) {
            throw new ApiError(
                422,
                "Этот статус не может быть предложен ИИ (under_review и cancelled применяются только вручную через workflow).",
                "INVALID_SUGGESTED_STATUS",
            );
        }
        patch.suggestedStatus = input.suggestedStatus;
    }
    if (input.suggestedReason !== undefined) {
        patch.suggestedReason = input.suggestedReason || null;
    }

    if (input.suggestedDeadline !== undefined) {
        patch.suggestedDeadline = input.suggestedDeadline
            ? dateAtHour(input.suggestedDeadline, user.timezone)
            : null;
    }

    if (input.suggestedAssigneeId !== undefined) {
        if (input.suggestedAssigneeId) {
            await assertAssignable(
                user,
                draft.workspaceId,
                input.suggestedAssigneeId,
            );
            const [membership] = await db
                .select({ id: workspaceMembers.id })
                .from(workspaceMembers)
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, draft.workspaceId),
                        eq(workspaceMembers.userId, input.suggestedAssigneeId),
                    ),
                )
                .limit(1);
            if (!membership) {
                throw new ApiError(
                    403,
                    "Исполнитель не является участником workspace.",
                    "ASSIGNEE_FORBIDDEN",
                );
            }
        }
        patch.suggestedAssigneeId = input.suggestedAssigneeId || null;
    }

    if (input.projectId !== undefined) {
        if (!input.projectId) {
            throw new ApiError(422, "Проект обязателен", "PROJECT_REQUIRED");
        }
        const [project] = await db
            .select({ id: projects.id, departmentId: projects.departmentId })
            .from(projects)
            .where(
                and(
                    eq(projects.id, input.projectId),
                    eq(projects.workspaceId, draft.workspaceId),
                    await projectScope(user, draft.workspaceId),
                ),
            )
            .limit(1);
        if (!project) {
            throw new ApiError(
                403,
                "Проект недоступен в этом workspace.",
                "PROJECT_FORBIDDEN",
            );
        }
        patch.projectId = project.id;
        patch.departmentId = project.departmentId;
    }

    if (input.departmentId !== undefined) {
        if (!input.departmentId) {
            throw new ApiError(422, "Отдел обязателен", "DEPARTMENT_REQUIRED");
        }
        const [department] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, input.departmentId))
            .limit(1);
        if (!department) {
            throw new ApiError(404, "Отдел не найден", "NOT_FOUND");
        }
        const [selectedProject] = await db
            .select()
            .from(projects)
            .where(
                eq(
                    projects.id,
                    (patch.projectId as string) ?? draft.projectId ?? "",
                ),
            );
        if (!selectedProject || selectedProject.departmentId !== department.id)
            throw new ApiError(
                422,
                "Department must match project",
                "INVALID_RELATION",
            );
        patch.departmentId = department.id;
    }

    const [saved] = await db
        .update(aiTaskDrafts)
        .set(patch)
        .where(and(eq(aiTaskDrafts.id, draftId), eq(aiTaskDrafts.state, "draft")))
        .returning({id: aiTaskDrafts.id});
    if (!saved) throw new ApiError(409, "This draft is locked", "DRAFT_LOCKED");

    const [updated] = await draftQuery()
        .where(eq(aiTaskDrafts.id, draftId))
        .limit(1);

    return updated;
}

export async function rejectDraft(user: AuthUser, draftId: string) {
    const draft = await loadDraft(user, draftId);
    if (draft.state === "published") {
        throw new ApiError(
            409,
            "Опубликованную задачу нельзя отклонить.",
            "DRAFT_PUBLISHED",
        );
    }

    const [rejected] = await db
        .update(aiTaskDrafts)
        .set({ state: "rejected", updatedAt: new Date() })
        .where(and(eq(aiTaskDrafts.id, draftId), ne(aiTaskDrafts.state, "published")))
        .returning({id: aiTaskDrafts.id});
    if (!rejected) throw new ApiError(409, "This draft is locked", "DRAFT_LOCKED");
}

export async function publishDrafts(
    user: AuthUser,
    workspaceId: string,
    draftIds: string[],
) {
    return withDbRetry(
        () => db.transaction((tx) => publishDraftsInTransaction(tx, user, workspaceId, draftIds)),
        "publishDrafts",
    );
}

async function publishDraftsInTransaction(
    tx: DbTransaction,
    user: AuthUser,
    workspaceId: string,
    draftIds: string[],
) {
    await requireWorkspaceMember(user, workspaceId, [...editableRoles], tx);

    const uniqueIds = [...new Set(draftIds)].slice(0, 50);
    if (uniqueIds.length === 0) return [];

    const draftRows = new Map<string, typeof aiTaskDrafts.$inferSelect>();
    for (const id of uniqueIds) {
        const draft = await loadDraft(user, id, tx);
        if (draft.workspaceId !== workspaceId || draft.state === "rejected")
            throw new ApiError(
                409,
                "Some drafts are unavailable or rejected",
                "DRAFT_UNAVAILABLE",
            );
        draftRows.set(id, draft);
        if (draft.suggestedAssigneeId)
            await assertAssignable(
                user,
                workspaceId,
                draft.suggestedAssigneeId,
                tx,
            );
        if (
            draft.state === "draft" &&
            draft.actionType === "update_status" &&
            draft.suggestedStatus &&
            !(AI_PROPOSABLE_STATUSES as readonly string[]).includes(
                draft.suggestedStatus,
            )
        ) {
            throw new ApiError(
                422,
                "Этот статус не может быть применён ИИ-черновиком.",
                "INVALID_SUGGESTED_STATUS",
            );
        }
    }

    const published = new Map<string, string>();
    const createIds: string[] = [];

    for (const id of uniqueIds) {
        const draft = draftRows.get(id)!;
        if (draft.publishedTaskId) {
            published.set(id, draft.publishedTaskId);
            continue;
        }
        if (draft.actionType !== "create_task") {
            published.set(
                id,
                await applyActionDraft(tx, user, workspaceId, draft),
            );
        } else {
            createIds.push(id);
        }
    }

    if (createIds.length > 0) {
        const projectRows = await tx
            .select({
                id: projects.id,
                departmentId: projects.departmentId,
            })
            .from(projects)
            .where(await projectScope(user, workspaceId, tx));

        const memberRows = await tx
            .select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.workspaceId, workspaceId));

        const allowedProjects = new Map(
            projectRows.map((project) => [project.id, project]),
        );
        const allowedMembers = new Set(memberRows.map((row) => row.userId));
        const fallbackProject = projectRows[0];

        if (!fallbackProject) {
            throw new ApiError(
                422,
                "В workspace нет проекта для публикации.",
                "NO_PROJECT",
            );
        }

        for (const id of createIds) {
            const draft = draftRows.get(id)!;
            const project =
                (draft.projectId
                    ? allowedProjects.get(draft.projectId)
                    : undefined) ?? fallbackProject;

            if (draft.projectId && !allowedProjects.has(draft.projectId))
                throw new ApiError(
                    403,
                    "Project outside your scope",
                    "FORBIDDEN",
                );

            const [task] = await tx
                .insert(tasks)
                .values({
                    workspaceId,
                    projectId: project.id,
                    departmentId: project.departmentId,
                    title: draft.title,
                    description: draft.description,
                    status: "todo",
                    priority: draft.priority,
                    assigneeId:
                        draft.suggestedAssigneeId &&
                        allowedMembers.has(draft.suggestedAssigneeId)
                            ? draft.suggestedAssigneeId
                            : null,
                    dueDate: draft.suggestedDeadline,
                    estimateMinutes: draft.estimateMinutes,
                    creatorId: user.id,
                })
                .returning();

            await tx
                .update(aiTaskDrafts)
                .set({
                    state: "published",
                    confirmedById: user.id,
                    confirmedAt: new Date(),
                    publishedTaskId: task.id,
                    updatedAt: new Date(),
                })
                .where(eq(aiTaskDrafts.id, draft.id));

            await tx.insert(taskActivity).values({
                taskId: task.id,
                actorId: user.id,
                action: "ai.published",
                changes: JSON.stringify({ draftId: draft.id }),
            });
            await notifyAssignment(tx, task);
            published.set(draft.id, task.id);
        }
    }

    return uniqueIds.map((id) => ({ draftId: id, taskId: published.get(id)! }));
}

async function applyActionDraft(
    tx: DbTransaction,
    user: AuthUser,
    workspaceId: string,
    draft: typeof aiTaskDrafts.$inferSelect,
): Promise<string> {
    const targetTaskId = draft.targetTaskId;
    if (!targetTaskId) {
        throw new ApiError(
            422,
            "Черновик не указывает на задачу.",
            "INVALID_ACTION_DRAFT",
        );
    }

    const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, targetTaskId), await taskScope(user, workspaceId, true, true, tx)))
        .limit(1);
    if (!task) {
        throw new ApiError(
            404,
            "Task not found or outside your scope",
            "NOT_FOUND",
        );
    }
    if (task.archivedAt) {
        throw new ApiError(
            409,
            "Задача в архиве; сначала восстановите её.",
            "TARGET_TASK_ARCHIVED",
        );
    }

    if (draft.actionType === "update_deadline") {
        if (!draft.suggestedDeadline) {
            throw new ApiError(
                422,
                "Черновик не содержит новой даты.",
                "INVALID_SUGGESTED_DEADLINE",
            );
        }
        if (task.dueDate?.getTime() !== draft.suggestedDeadline.getTime()) {
            await updateTaskInTransaction(tx, user, targetTaskId, {
                dueDate: draft.suggestedDeadline.toISOString(),
            });
        }
    } else {
        const status = draft.suggestedStatus;
        if (
            !status ||
            !(AI_PROPOSABLE_STATUSES as readonly string[]).includes(status)
        ) {
            throw new ApiError(
                422,
                "Черновик не содержит допустимого для ИИ статуса.",
                "INVALID_SUGGESTED_STATUS",
            );
        }
        if (status === "completed" && task.requiresReview) {
            throw new ApiError(
                409,
                "Задача требует ревью: завершите её через workflow (submit/accept).",
                "TASK_REVIEW_REQUIRED",
            );
        }

        if (task.status !== status) {
            if (status === "blocked") {
                const reason = draft.suggestedReason?.trim() ?? "";
                if (reason.length < 3) {
                    throw new ApiError(
                        422,
                        "Для блокировки задачи укажите причину (минимум 3 символа).",
                        "BLOCK_REASON_REQUIRED",
                    );
                }
                await applyTaskWorkflowInTransaction(tx, user, targetTaskId, {
                    action: "block",
                    reason,
                });
            } else if (task.status === "blocked") {
                // The workflow only allows leaving "blocked" via unblock
                // (which lands on "in_progress"); any other AI-proposed
                // status is applied right after the unblock.
                await applyTaskWorkflowInTransaction(tx, user, targetTaskId, {
                    action: "unblock",
                });
                if (status !== "in_progress") {
                    await updateTaskInTransaction(tx, user, targetTaskId, { status });
                }
            } else {
                await updateTaskInTransaction(tx, user, targetTaskId, { status });
            }
        }
    }

    await tx
        .update(aiTaskDrafts)
        .set({
            state: "published",
            confirmedById: user.id,
            confirmedAt: new Date(),
            publishedTaskId: targetTaskId,
            updatedAt: new Date(),
        })
        .where(eq(aiTaskDrafts.id, draft.id));

    return targetTaskId;
}
