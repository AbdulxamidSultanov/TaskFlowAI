import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
    notifications,
    reminderDeliveries,
    tasks,
    userSettings,
    users,
    workspaceMembers,
    type Task,
} from "@/db/schema";

type Store = Pick<typeof db, "select" | "insert" | "update" | "delete">;
export async function notifyAssignment(store: Store, task: Task) {
    if (!task.assigneeId || task.archivedAt || task.status === "completed")
        return;
    const [settings] = await store
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, task.assigneeId));
    const locale = settings?.locale ?? "ru";
    const title = {
        ru: "Вам назначена задача",
        en: "Task assigned to you",
        uz: "Sizga vazifa tayinlandi",
    }[locale];
    await store
        .insert(notifications)
        .values({
            userId: task.assigneeId,
            type: "task_assigned",
            title,
            body: task.title,
            entityType: "task",
            entityId: task.id,
            dedupeKey: `assigned:${task.id}:${task.assigneeId}:${task.updatedAt.getTime()}`,
        })
        .onConflictDoNothing();
}

export async function deliverReminders(now = new Date(), userId?: string) {
    const dueTasks = await db
        .select({ task: tasks, settings: userSettings })
        .from(tasks)
        .innerJoin(users, eq(users.id, tasks.assigneeId))
        .innerJoin(
            workspaceMembers,
            and(
                eq(workspaceMembers.userId, users.id),
                eq(workspaceMembers.workspaceId, tasks.workspaceId),
            ),
        )
        .leftJoin(userSettings, eq(userSettings.userId, users.id))
        .where(
            and(
                ne(tasks.status, "completed"),
                isNull(tasks.archivedAt),
                eq(users.isActive, true),
                userId ? eq(users.id, userId) : undefined,
            ),
        );
    let delivered = 0;
    for (const { task, settings } of dueTasks) {
        if (!task.assigneeId || settings?.taskReminders === false) continue;
        const hours = [
            ...new Set(
                (settings?.reminderHours ?? "24,5,1")
                    .split(",")
                    .map(Number)
                    .filter((n) => Number.isFinite(n) && n > 0 && n <= 168),
            ),
        ].sort((a, b) => a - b);
        const locale = settings?.locale ?? "ru";
        for (const kind of ["start", "due"] as const) {
            const at = kind === "start" ? task.startDate : task.dueDate;
            if (
                !at ||
                (kind === "start" && !["todo", "queued"].includes(task.status))
            )
                continue;
            const remaining = (at.getTime() - now.getTime()) / 3600000;
            if (kind === "start" && remaining <= 0) continue;
            if (remaining <= 0 && settings?.overduePush === false) continue;
            const threshold =
                remaining <= 0 ? 0 : hours.find((h) => remaining <= h);
            if (threshold === undefined) continue;
            const key = `${kind}:${task.id}:${task.assigneeId}:${at.getTime()}:${threshold}`;
            const amount = Math.max(1, Math.ceil(Math.abs(remaining) * 60));
            const duration =
                amount >= 60
                    ? `${Math.ceil(amount / 60)} ${locale === "ru" ? "ч" : locale === "uz" ? "soat" : "h"}`
                    : `${amount} ${locale === "ru" ? "мин" : "min"}`;
            const title =
                kind === "start"
                    ? {
                          ru: `Начало задачи через ${duration}`,
                          en: `Task starts in ${duration}`,
                          uz: `Vazifa ${duration} dan keyin boshlanadi`,
                      }[locale]
                    : remaining <= 0
                      ? {
                            ru: "Срок задачи истёк",
                            en: "Task is overdue",
                            uz: "Vazifa muddati o'tdi",
                        }[locale]
                      : {
                            ru: `До срока задачи осталось ${duration}`,
                            en: `Task is due in ${duration}`,
                            uz: `Vazifa muddatiga ${duration} qoldi`,
                        }[locale];
            await db.transaction(async (tx) => {
                const inserted = await tx
                    .insert(reminderDeliveries)
                    .values({ key, taskId: task.id, userId: task.assigneeId! })
                    .onConflictDoNothing()
                    .returning();
                if (!inserted.length) return;
                await tx.insert(notifications).values({
                    userId: task.assigneeId!,
                    type: "task_due",
                    title,
                    body: task.title,
                    entityType: "task",
                    entityId: task.id,
                    dedupeKey: key,
                });
                delivered++;
            });
        }
    }
    return { delivered, checked: dueTasks.length };
}
