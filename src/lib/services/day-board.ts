import { defaultSupervisor } from "./task-workflow";
import { and, asc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
    taskActionRequests,
    taskParticipants,
    tasks,
    users,
} from "@/db/schema";
import { taskScope, workspaceScope } from "@/lib/auth/scope";
import { requireWorkspaceSupervisor } from "@/lib/auth/guards";
import { taskPermissions } from "@/lib/auth/task-rights";
import type { AuthUser } from "@/lib/auth/session";
import { userDayBounds, dateAtHour } from "@/lib/time-zone";
export const boardQuery = z.object({
    workspaceId: z.string().min(1),
    assigneeId: z.string().optional(),
    status: z.string().optional(),
    fromDay: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    toDay: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
});
export async function getDayBoard(
    user: AuthUser,
    query: z.infer<typeof boardQuery>,
    supervisor = false,
    now = new Date(),
) {
    if (supervisor) await requireWorkspaceSupervisor(user, query.workspaceId);
    const { day, start, end } = userDayBounds(now, user.timezone);
    const requests = await db
        .select()
        .from(taskActionRequests)
        .where(
            and(
                eq(taskActionRequests.targetUserId, user.id),
                isNull(taskActionRequests.resolvedAt),
            ),
        );
    const conditions = [
        await taskScope(user, query.workspaceId, false, !supervisor),
        ne(tasks.status, "completed"),
        ne(tasks.status, "cancelled"),
    ];
    if (supervisor) {
        const scope = await workspaceScope(user, query.workspaceId);
        if (scope !== null)
            conditions.push(
                inArray(
                    tasks.assigneeId,
                    scope.filter((id) => id !== user.id),
                ),
            );
    }
    if (query.assigneeId)
        conditions.push(eq(tasks.assigneeId, query.assigneeId));
    if (query.status)
        conditions.push(
            eq(tasks.status, query.status as typeof tasks.$inferSelect.status),
        );
    if (query.fromDay)
        conditions.push(
            gte(
                tasks.dueDate,
                userDayBounds(
                    dateAtHour(query.fromDay, user.timezone, 12),
                    user.timezone,
                ).start,
            ),
        );
    if (query.toDay)
        conditions.push(
            lt(
                tasks.dueDate,
                userDayBounds(
                    dateAtHour(query.toDay, user.timezone, 12),
                    user.timezone,
                ).end,
            ),
        );
    if (query.from) conditions.push(gte(tasks.dueDate, new Date(query.from)));
    if (query.to) conditions.push(lt(tasks.dueDate, new Date(query.to)));
    const rows = await db
        .select({ task: tasks, assigneeName: users.name })
        .from(tasks)
        .leftJoin(users, eq(users.id, tasks.assigneeId))
        .where(and(...conditions))
        .orderBy(asc(tasks.dueDate));
    const memberships = supervisor
        ? []
        : await db
              .select({ id: taskParticipants.taskId })
              .from(taskParticipants)
              .where(eq(taskParticipants.userId, user.id));
    const participated = new Set(memberships.map((row) => row.id));
    const cards = await Promise.all(
        rows.map(async ({ task, assigneeName }) => {
            const permissions = await taskPermissions(user, task);
            const actions = requests.filter(
                (r) =>
                    r.taskId === task.id &&
                    (r.kind === "review"
                        ? permissions.review
                        : r.kind === "unblock"
                          ? permissions.unblock
                          : permissions.comment),
            );
            if (
                task.status === "under_review" &&
                permissions.review &&
                !actions.some((r) => r.kind === "review")
            )
                actions.push({
                    id: `review:${task.id}`,
                    taskId: task.id,
                    targetUserId: user.id,
                    requestedById: null,
                    kind: "review",
                    reason: "",
                    createdAt: task.submittedAt ?? task.updatedAt,
                    resolvedAt: null,
                });
            if (
                task.status === "blocked" &&
                permissions.unblock &&
                !actions.some((a) => a.kind === "unblock") &&
                (task.helperId ??
                    (await defaultSupervisor(
                        task.workspaceId,
                        task.assigneeId,
                    ))) === user.id
            )
                actions.push({
                    id: `unblock:${task.id}`,
                    taskId: task.id,
                    targetUserId: user.id,
                    requestedById: task.blockedById,
                    kind: "unblock",
                    reason: task.blockReason ?? "",
                    createdAt: task.blockedAt ?? task.updatedAt,
                    resolvedAt: null,
                });
            return {
                ...task,
                assigneeName,
                permissions,
                actions,
                personal:
                    task.assigneeId === user.id || participated.has(task.id),
            };
        }),
    );
    if (supervisor) {
        const groups = {
            overdue: cards.filter((t) => t.dueDate && t.dueDate < now),
            blocked: cards.filter((t) => t.status === "blocked"),
            review: cards.filter((t) => t.status === "under_review"),
        };
        return {
            day,
            timeZone: user.timezone,
            groups: {
                today: [] as typeof cards,
                action: [] as typeof cards,
                ...groups,
            },
            uniqueCount: new Set(
                Object.values(groups)
                    .flat()
                    .map((t) => t.id),
            ).size,
        };
    }
    const groups = {
        today: cards.filter(
            (t) =>
                t.personal &&
                ((t.dueDate && t.dueDate >= start && t.dueDate < end) ||
                    (t.startDate && t.startDate >= start && t.startDate < end)),
        ),
        overdue: cards.filter(
            (t) => t.personal && t.dueDate && t.dueDate < now,
        ),
        action: cards.filter((t) => t.actions.length > 0),
    };
    return {
        day,
        timeZone: user.timezone,
        groups: {
            blocked: [] as typeof cards,
            review: [] as typeof cards,
            ...groups,
        },
        uniqueCount: new Set(
            Object.values(groups)
                .flat()
                .map((t) => t.id),
        ).size,
    };
}
