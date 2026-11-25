import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbReader, type DbTransaction } from "@/db";
import {
    notifications,
    comments,
    taskActionRequests,
    taskActivity,
    taskDependencies,
    tasks,
    timeEntries,
    users,
    workspaceMembers,
    workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { requireTaskPermission, taskPermissions } from "@/lib/auth/task-rights";
import { requireTaskAccess } from "@/lib/auth/scope";
import { userDayBounds } from "@/lib/time-zone";
import type { AuthUser } from "@/lib/auth/session";

export const workflowInput = z.object({
    action: z.enum([
        "submit",
        "accept",
        "rework",
        "block",
        "unblock",
        "request",
        "requestDeadline",
        "requestConditions",
        "resolve",
        "cancel",
    ]),
    reason: z.string().trim().max(2000).optional(),
    targetUserId: z.string().nullable().optional(),
    requestId: z.string().optional(),
    requestedChange: z.string().trim().max(2000).optional(),
});
// A change request and its creation event share an ID. The request tracks delivery
// and resolution; the event preserves the original proposal even after a reply.
export function openTaskRequests(userId: string, workspaceId: string, taskId?: string) {
    return db.select({
        ...getTableColumns(taskActionRequests),
        requestedChange: sql<string | null>`json_extract(${taskActivity.changes}, '$.requestedChange')`,
    })
        .from(taskActionRequests)
        .innerJoin(tasks, eq(tasks.id, taskActionRequests.taskId))
        .leftJoin(taskActivity, and(
            eq(taskActivity.id, taskActionRequests.id),
            eq(taskActivity.taskId, taskActionRequests.taskId),
            eq(taskActivity.action, sql`'workflow.' || ${taskActionRequests.kind}`),
        ))
        .where(and(
            eq(tasks.workspaceId, workspaceId),
            eq(taskActionRequests.targetUserId, userId),
            isNull(taskActionRequests.resolvedAt),
            taskId ? eq(taskActionRequests.taskId, taskId) : undefined,
        ));
}

export async function actorFor(id: string, store: DbReader = db): Promise<AuthUser | null> {
    const [user] = await store
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.isActive, true)));
    return user ? { ...user, department: null } : null;
}
export async function defaultSupervisor(
    workspaceId: string,
    userId: string | null,
    store: DbReader = db,
) {
    const [member] = userId
        ? await store
              .select()
              .from(workspaceMembers)
              .where(
                  and(
                      eq(workspaceMembers.workspaceId, workspaceId),
                      eq(workspaceMembers.userId, userId),
                  ),
              )
        : [];
    if (member?.managerUserId) return member.managerUserId;
    const [workspace] = await store
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
    return workspace?.ownerId ?? null;
}
export async function initialReviewer(
    workspaceId: string,
    assigneeId: string | null,
    requested?: string | null,
    store: DbReader = db,
) {
    const target =
        requested ?? (await defaultSupervisor(workspaceId, assigneeId, store));
    if (!target || target === assigneeId)
        throw new ApiError(
            422,
            "Choose a different reviewer with task access",
            "REVIEWER_REQUIRED",
        );
    const members = await store
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId));
    const reviewer = members.find((m) => m.userId === target);
    if (!reviewer || reviewer.role === "viewer")
        throw new ApiError(422, "Reviewer is unavailable", "INVALID_REVIEWER");
    if (["owner", "admin"].includes(reviewer.role)) return target;
    let cursor = assigneeId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        cursor =
            members.find((m) => m.userId === cursor)?.managerUserId ?? null;
        if (cursor === target && reviewer.accessScope === "team") return target;
    }
    throw new ApiError(
        422,
        "Add a reviewer as a task contributor before selecting them",
        "REVIEWER_ACCESS_REQUIRED",
    );
}
export async function actionRecipient(
    userId: string,
    taskId: string,
    action: "view" | "comment" | "review" | "changeDeadline" | "edit" = "view",
    store: DbReader = db,
) {
    const actor = await actorFor(userId, store);
    if (!actor)
        throw new ApiError(422, "Recipient is inactive", "INVALID_RECIPIENT");
    const { task, permissions } = await requireTaskPermission(
        actor,
        taskId,
        action,
        store,
    );
    return { actor, task, permissions };
}
export async function applyTaskWorkflow(
    user: AuthUser,
    id: string,
    raw: unknown,
) {
    return db.transaction((tx) =>
        applyTaskWorkflowInTransaction(tx, user, id, raw),
    );
}

export async function applyTaskWorkflowInTransaction(
    tx: DbTransaction,
    user: AuthUser,
    id: string,
    raw: unknown,
) {
    const input = workflowInput.parse(raw);
    const task = await requireTaskAccess(user, id, false, tx);
    const rights = await taskPermissions(user, task, tx);
    if (task.archivedAt || ["completed", "cancelled"].includes(task.status))
        throw new ApiError(
            409,
            "Reopen this task before changing its workflow",
            "TASK_CLOSED",
        );
    const changeKind = input.action === "requestDeadline" || input.action === "requestConditions" ? input.action : undefined;
    const changeRequestId = changeKind ? randomUUID() : undefined;
    let target: string | null = null;
    const forbidden = () => {
        throw new ApiError(403, "Action is not allowed", "FORBIDDEN");
    };
    if (input.action === "submit") {
        if (!rights.status || user.id !== task.assigneeId) forbidden();
        if (task.status === "blocked" || task.status === "under_review")
            throw new ApiError(
                409,
                "Unblock the task or wait for review",
                "INVALID_TRANSITION",
            );
        if (task.requiresReview) {
            target =
                task.reviewerId ??
                (await defaultSupervisor(task.workspaceId, task.assigneeId, tx));
            if (!target)
                throw new ApiError(
                    422,
                    "Reviewer required",
                    "REVIEWER_REQUIRED",
                );
            await actionRecipient(target, id, "review", tx);
        }
    } else if (input.action === "accept" || input.action === "rework") {
        if (!rights.review) forbidden();
        if (task.status !== "under_review")
            throw new ApiError(
                409,
                "Task is not awaiting review",
                "INVALID_TRANSITION",
            );
    } else if (input.action === "block") {
        if (!rights.block) forbidden();
        if (task.status === "blocked")
            throw new ApiError(
                409,
                "Task is already blocked",
                "INVALID_TRANSITION",
            );
        target =
            input.targetUserId ??
            (await defaultSupervisor(task.workspaceId, task.assigneeId, tx));
        if (input.targetUserId)
            await actionRecipient(input.targetUserId, id, "comment", tx);
        else if (target) {
            try {
                await actionRecipient(target, id, "comment", tx);
            } catch {
                target = null;
            }
        }
    } else if (input.action === "unblock") {
        if (!rights.unblock) forbidden();
        if (task.status !== "blocked")
            throw new ApiError(
                409,
                "Task is not blocked",
                "INVALID_TRANSITION",
            );
    } else if (changeKind) {
        if (!rights.comment || task.assigneeId !== user.id) forbidden();
        target = await defaultSupervisor(task.workspaceId, user.id, tx);
        if (!target || target === user.id)
            throw new ApiError(422, "No supervisor available for this request", "SUPERVISOR_REQUIRED");
        if (input.targetUserId && input.targetUserId !== target) forbidden();
        if (input.action === "requestDeadline") {
            const proposed = z.iso.date().safeParse(input.requestedChange);
            if (!proposed.success || (task.startDate && proposed.data < userDayBounds(task.startDate, user.timezone).day))
                throw new ApiError(422, "Choose a valid deadline on or after the task start date", "INVALID_DEADLINE");
        } else if (!input.requestedChange || input.requestedChange.length < 3) {
            throw new ApiError(422, "Describe the proposed change to the task", "CHANGE_REQUIRED");
        }
        await actionRecipient(target, id, input.action === "requestDeadline" ? "changeDeadline" : "edit", tx);
    } else if (input.action === "request") {
        if (!rights.comment) forbidden();
        target =
            input.targetUserId ??
            (await defaultSupervisor(task.workspaceId, task.assigneeId, tx));
        if (!target)
            throw new ApiError(422, "Recipient required", "RECIPIENT_REQUIRED");
        await actionRecipient(target, id, "comment", tx);
    } else if (input.action === "resolve") {
        if (!rights.comment) forbidden();
        if (!input.requestId)
            throw new ApiError(422, "Request required", "REQUEST_REQUIRED");
    } else if (input.action === "cancel") {
        if (!rights.delete) forbidden();
    }
    if (
        (changeKind || ["block", "rework", "request"].includes(input.action)) &&
        (!input.reason || input.reason.length < 3)
    )
        throw new ApiError(
            422,
            "An explanation of at least 3 characters is required",
            "REASON_REQUIRED",
        );
    const patch: Partial<typeof tasks.$inferInsert> = {
        updatedAt: new Date(),
    };
    const closeKinds = (kinds: Array<typeof taskActionRequests.$inferSelect.kind>) =>
        tx
            .update(taskActionRequests)
            .set({ resolvedAt: new Date() })
            .where(
                and(
                    eq(taskActionRequests.taskId, id),
                    inArray(taskActionRequests.kind, kinds),
                    isNull(taskActionRequests.resolvedAt),
                ),
            );
    if (input.action === "submit" || input.action === "accept") {
        const deps = await tx
            .select({ status: tasks.status })
            .from(taskDependencies)
            .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
            .where(eq(taskDependencies.taskId, id));
        if (
            deps.some((d) => !["completed", "cancelled"].includes(d.status))
        )
            throw new ApiError(
                409,
                "Blocking dependencies are incomplete",
                "TASK_BLOCKED",
            );
    }
    if (input.action === "submit") {
        patch.status = task.requiresReview ? "under_review" : "completed";
        patch.submittedAt = new Date();
        patch.completedAt = task.requiresReview ? null : new Date();
        patch.reviewerId = target ?? task.reviewerId;
        await closeKinds(task.requiresReview ? ["review"] : ["review", "response", "unblock", "requestDeadline", "requestConditions"]);
        if (target)
            await tx
                .insert(taskActionRequests)
                .values({
                    taskId: id,
                    targetUserId: target,
                    requestedById: user.id,
                    kind: "review",
                    reason: input.reason ?? "",
                });
    } else if (input.action === "accept") {
        patch.status = "completed";
        patch.completedAt = new Date();
        patch.reviewedAt = new Date();
        patch.reviewedById = user.id;
        await closeKinds(["review", "response", "unblock", "requestDeadline", "requestConditions"]);
    } else if (input.action === "rework") {
        patch.status = "in_progress";
        patch.submittedAt = null;
        patch.reviewedAt = null;
        patch.reviewedById = null;
        await closeKinds(["review"]);
        await tx
            .insert(comments)
            .values({ taskId: id, authorId: user.id, body: input.reason! });
    } else if (input.action === "block") {
        patch.status = "blocked";
        patch.blockReason = input.reason!;
        patch.blockedAt = new Date();
        patch.blockedById = user.id;
        patch.helperId = target;
        await closeKinds(["review", "unblock"]);
        if (target)
            await tx
                .insert(taskActionRequests)
                .values({
                    taskId: id,
                    targetUserId: target,
                    requestedById: user.id,
                    kind: "unblock",
                    reason: input.reason!,
                });
    } else if (input.action === "unblock") {
        patch.status = "in_progress";
        patch.blockReason = null;
        patch.blockedAt = null;
        patch.blockedById = null;
        patch.helperId = null;
        await closeKinds(["unblock"]);
    } else if (input.action === "request" || changeKind) {
        await tx
            .insert(taskActionRequests)
            .values({
                taskId: id,
                targetUserId: target!,
                requestedById: user.id,
                kind: changeKind ?? "response",
                id: changeRequestId,
                reason: input.reason!,
            });
    } else if (input.action === "resolve") {
        const [request] = await tx
            .select()
            .from(taskActionRequests)
            .where(
                and(
                    eq(taskActionRequests.id, input.requestId!),
                    eq(taskActionRequests.taskId, id),
                    eq(taskActionRequests.targetUserId, user.id),
                    isNull(taskActionRequests.resolvedAt),
                ),
            );
        if (!request)
            throw new ApiError(
                404,
                "Action request not found",
                "NOT_FOUND",
            );
        if (request.kind === "review" || request.kind === "unblock")
            throw new ApiError(
                422,
                "Use the review or unblock action",
                "WORKFLOW_ACTION_REQUIRED",
            );
        if (!input.reason || input.reason.length < 3)
            throw new ApiError(
                422,
                "A response is required",
                "REASON_REQUIRED",
            );
        await tx
            .insert(comments)
            .values({ taskId: id, authorId: user.id, body: input.reason });
        await tx
            .update(taskActionRequests)
            .set({ resolvedAt: new Date() })
            .where(eq(taskActionRequests.id, request.id));
    } else if (input.action === "cancel") {
        patch.status = "cancelled";
        patch.completedAt = null;
        await closeKinds(["review", "response", "unblock", "requestDeadline", "requestConditions"]);
    }
    await tx.update(tasks).set(patch).where(eq(tasks.id, id));
    if (["submit", "accept", "cancel"].includes(input.action))
        await tx
            .delete(notifications)
            .where(
                and(
                    eq(notifications.entityId, id),
                    eq(notifications.type, "task_due"),
                    isNull(notifications.readAt),
                ),
            );
    if (["submit", "accept", "cancel", "block"].includes(input.action)) {
        const running = await tx
            .select()
            .from(timeEntries)
            .where(
                and(eq(timeEntries.taskId, id), isNull(timeEntries.endAt)),
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
    await tx
        .insert(taskActivity)
        .values({
            taskId: id,
            actorId: user.id,
            id: changeRequestId,
            action: `workflow.${input.action}`,
            changes: JSON.stringify({
                reason: input.reason,
                targetUserId: target,
                requestId: input.requestId ?? changeRequestId,
                requestedChange: changeKind ? input.requestedChange : undefined,
            }),
        });
    return { updated: true };
}
