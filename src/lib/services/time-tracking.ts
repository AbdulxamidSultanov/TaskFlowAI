import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { taskActivity, tasks, timeEntries, users } from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { requireTaskAccess, taskScope, visibleUserIds } from "@/lib/auth/scope";
import type { AuthUser } from "@/lib/auth/session";
import {
    timeReasons,
    type TimeReport,
    type TimeEntry,
    type TimeReason,
} from "@/lib/time-types";

export const entryInput = z.object({
    taskId: z.string().min(1),
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
    difficulty: z.number().int().min(1).max(5).default(1),
    reason: z.enum(timeReasons).default("none"),
    note: z.string().trim().max(2000).default(""),
});
export const stopInput = entryInput
    .omit({ taskId: true, startAt: true })
    .extend({ endAt: z.string().datetime({ offset: true }).optional() });
function validateExplanation(input: {
    difficulty: number;
    reason: string;
    note: string;
}) {
    if (input.difficulty >= 4 && input.reason === "none")
        throw new ApiError(
            422,
            "Choose what made this work difficult",
            "REASON_REQUIRED",
        );
    if (input.reason === "other" && input.note.length < 3)
        throw new ApiError(422, "Describe the difficulty", "NOTE_REQUIRED");
}
export async function createTimeEntry(user: AuthUser, raw: unknown) {
    const input = entryInput.parse(raw);
    validateExplanation(input);
    const task = await requireTaskAccess(user, input.taskId, true);
    if (task.archivedAt || (task.status === "completed" && !input.endAt))
        throw new ApiError(409, "Task is completed or archived", "TASK_CLOSED");
    const startAt = input.startAt ? new Date(input.startAt) : new Date();
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (input.startAt && !endAt)
        throw new ApiError(
            422,
            "Manual entries require an end time",
            "END_REQUIRED",
        );
    if (
        startAt.getTime() > Date.now() ||
        (endAt &&
            (endAt <= startAt ||
                endAt.getTime() > Date.now() ||
                endAt.getTime() - startAt.getTime() > 86400000))
    )
        throw new ApiError(
            422,
            "Invalid time interval (maximum 24 hours for manual entries)",
            "INVALID_TIME_RANGE",
        );
    return db.transaction(async (tx) => {
        const overlap = await tx
            .select({ id: timeEntries.id })
            .from(timeEntries)
            .where(
                and(
                    eq(timeEntries.userId, user.id),
                    endAt ? lt(timeEntries.startAt, endAt) : undefined,
                    or(
                        isNull(timeEntries.endAt),
                        gt(timeEntries.endAt, startAt),
                    ),
                ),
            )
            .limit(1);
        if (overlap.length)
            throw new ApiError(
                409,
                "Another time entry overlaps this interval",
                "TIME_OVERLAP",
            );
        const [entry] = await tx
            .insert(timeEntries)
            .values({ ...input, userId: user.id, startAt, endAt })
            .returning();
        await tx.insert(taskActivity).values({
            taskId: task.id,
            actorId: user.id,
            action: endAt ? "time.logged" : "timer.started",
            changes: JSON.stringify({ entryId: entry.id }),
        });
        return entry;
    });
}
export async function stopTimeEntry(user: AuthUser, id: string, raw: unknown) {
    const input = stopInput.parse(raw);
    validateExplanation(input);
    return db.transaction(async (tx) => {
        const [entry] = await tx
            .select()
            .from(timeEntries)
            .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, user.id)))
            .limit(1);
        if (!entry)
            throw new ApiError(404, "Time entry not found", "NOT_FOUND");
        if (entry.endAt)
            throw new ApiError(
                409,
                "Timer is already stopped",
                "TIMER_STOPPED",
            );
        const endAt = input.endAt ? new Date(input.endAt) : new Date();
        if (endAt <= entry.startAt || endAt.getTime() > Date.now())
            throw new ApiError(
                422,
                "Invalid timer end time",
                "INVALID_TIME_RANGE",
            );
        const [updated] = await tx
            .update(timeEntries)
            .set({ ...input, endAt })
            .where(and(eq(timeEntries.id, id), isNull(timeEntries.endAt)))
            .returning();
        if (!updated)
            throw new ApiError(
                409,
                "Timer is already stopped",
                "TIMER_STOPPED",
            );
        await tx.insert(taskActivity).values({
            taskId: entry.taskId,
            actorId: user.id,
            action: "timer.stopped",
            changes: JSON.stringify({
                entryId: id,
                difficulty: input.difficulty,
                reason: input.reason,
            }),
        });
        return updated;
    });
}
export async function deleteTimeEntry(user: AuthUser, id: string) {
    await db.transaction(async (tx) => {
        const [entry] = await tx
            .select()
            .from(timeEntries)
            .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, user.id)))
            .limit(1);
        if (!entry)
            throw new ApiError(404, "Time entry not found", "NOT_FOUND");
        await tx.insert(taskActivity).values({
            taskId: entry.taskId,
            actorId: user.id,
            action: "time.deleted",
            changes: JSON.stringify({ entry }),
        });
        await tx.delete(timeEntries).where(eq(timeEntries.id, id));
    });
}
export const reportQuery = z.object({
    workspaceId: z.string().min(1),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    userId: z.string().optional(),
});
export async function getTimeReport(
    user: AuthUser,
    input: z.infer<typeof reportQuery>,
): Promise<TimeReport> {
    const people = await visibleUserIds(user, input.workspaceId);
    if (input.userId && !people.includes(input.userId))
        throw new ApiError(403, "User outside your scope", "FORBIDDEN");
    const from = input.from ? new Date(input.from).getTime() : 0;
    const to = Math.min(
        input.to ? new Date(input.to).getTime() : Date.now(),
        Date.now(),
    );
    if (from >= to)
        throw new ApiError(
            422,
            "Invalid report interval",
            "INVALID_TIME_RANGE",
        );
    const rows = await db
        .select({ entry: timeEntries, task: tasks, userName: users.name })
        .from(timeEntries)
        .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
        .innerJoin(users, eq(users.id, timeEntries.userId))
        .where(
            and(
                await taskScope(user, input.workspaceId, true),
                inArray(
                    timeEntries.userId,
                    input.userId ? [input.userId] : people,
                ),
                lt(timeEntries.startAt, new Date(to)),
                or(
                    isNull(timeEntries.endAt),
                    gt(timeEntries.endAt, new Date(from)),
                ),
            ),
        )
        .orderBy(desc(timeEntries.startAt));
    const entries: TimeEntry[] = rows.map(({ entry, task, userName }) => ({
        ...entry,
        taskTitle: task.title,
        userName,
        startAt: entry.startAt.toISOString(),
        endAt: entry.endAt?.toISOString() ?? null,
        minutes: Math.max(
            0,
            (Math.min(entry.endAt?.getTime() ?? to, to) -
                Math.max(entry.startAt.getTime(), from)) /
                60000,
        ),
    }));
    const [ownRunning] = await db
        .select({
            entry: timeEntries,
            taskTitle: tasks.title,
            userName: users.name,
        })
        .from(timeEntries)
        .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
        .innerJoin(users, eq(users.id, timeEntries.userId))
        .where(and(eq(timeEntries.userId, user.id), isNull(timeEntries.endAt)))
        .limit(1);
    const running = ownRunning
        ? {
              ...ownRunning.entry,
              taskTitle: ownRunning.taskTitle,
              userName: ownRunning.userName,
              startAt: ownRunning.entry.startAt.toISOString(),
              endAt: null,
              minutes: Math.max(
                  0,
                  (Date.now() - ownRunning.entry.startAt.getTime()) / 60000,
              ),
          }
        : null;
    const taskMap = new Map<string, TimeReport["tasks"][number]>();
    const reasons = new Map<TimeReason, number>();
    for (const entry of entries) {
        const task = rows.find((row) => row.task.id === entry.taskId)!.task;
        const item = taskMap.get(task.id) ?? {
            id: task.id,
            title: task.title,
            estimateMinutes: task.estimateMinutes,
            minutes: 0,
            entries: 0,
            difficulty: 0,
            overrun: false,
            reasons: [],
        };
        item.minutes += entry.minutes;
        item.entries++;
        item.difficulty += entry.difficulty;
        const reason = item.reasons.find((r) => r.reason === entry.reason);
        if (reason) reason.minutes += entry.minutes;
        else
            item.reasons.push({ reason: entry.reason, minutes: entry.minutes });
        taskMap.set(task.id, item);
        reasons.set(
            entry.reason,
            (reasons.get(entry.reason) ?? 0) + entry.minutes,
        );
    }
    const taskRows = [...taskMap.values()]
        .map((t) => ({
            ...t,
            difficulty: t.difficulty / t.entries,
            overrun:
                t.estimateMinutes !== null &&
                t.estimateMinutes > 0 &&
                t.minutes > t.estimateMinutes * 1.2 &&
                t.minutes - t.estimateMinutes >= 30,
        }))
        .sort((a, b) => b.minutes - a.minutes);
    return {
        entries,
        running,
        tasks: taskRows,
        reasons: [...reasons]
            .map(([reason, minutes]) => ({ reason, minutes }))
            .sort((a, b) => b.minutes - a.minutes),
        totals: {
            minutes: entries.reduce((s, e) => s + e.minutes, 0),
            entries: entries.length,
            tasks: taskRows.length,
            overruns: taskRows.filter((t) => t.overrun).length,
        },
    };
}
