import { taskScope, projectScope, departmentScope } from "@/lib/auth/scope";
import type { AuthUser } from "@/lib/auth/session";
import { and, eq, isNull, ne, or, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
    departments,
    projects,
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
    if (
        !task.assigneeId ||
        task.archivedAt ||
        ["completed", "cancelled"].includes(task.status)
    )
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
                ne(tasks.status, "cancelled"),
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
                (
                    settings?.reminderHours ??
                    process.env.TASK_REMINDER_HOURS ??
                    "24"
                )
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
                const [current] = await tx
                    .select()
                    .from(tasks)
                    .where(eq(tasks.id, task.id));
                if (
                    !current ||
                    current.archivedAt ||
                    ["completed", "cancelled"].includes(current.status) ||
                    current.assigneeId !== task.assigneeId ||
                    (kind === "due"
                        ? current.dueDate?.getTime()
                        : current.startDate?.getTime()) !== at.getTime()
                )
                    return;
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
    const blocked = await deliverBlockNotifications(userId);
    return { delivered: delivered + blocked, checked: dueTasks.length };
}

export async function notificationScope(user: AuthUser) {
    return and(
        eq(notifications.userId, user.id),
        or(
            isNull(notifications.entityId),
            and(
                eq(notifications.entityType, "task"),
                inArray(
                    notifications.entityId,
                    db
                        .select({ id: tasks.id })
                        .from(tasks)
                        .where(await taskScope(user, undefined, true)),
                ),
            ),
            and(
                eq(notifications.entityType, "project"),
                inArray(
                    notifications.entityId,
                    db
                        .select({ id: projects.id })
                        .from(projects)
                        .where(await projectScope(user)),
                ),
            ),
            and(
                eq(notifications.entityType, "department"),
                inArray(
                    notifications.entityId,
                    db
                        .select({ id: departments.id })
                        .from(departments)
                        .where(await departmentScope(user)),
                ),
            ),
        ),
    )!;
}
async function deliverBlockNotifications(userId?: string) {
    const { actorFor, defaultSupervisor } = await import("./task-workflow");
    const { requireTaskAccess } = await import("@/lib/auth/scope");
    const { taskPermissions } = await import("@/lib/auth/task-rights");
    const blocked = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.status, "blocked"), isNull(tasks.archivedAt)));
    let delivered = 0;
    for (const task of blocked) {
        const target =
            task.helperId ??
            (await defaultSupervisor(task.workspaceId, task.assigneeId));
        if (!target || (userId && target !== userId)) continue;
        const actor = await actorFor(target);
        if (!actor) continue;
        try {
            await requireTaskAccess(actor, task.id);
            if (!(await taskPermissions(actor, task)).unblock) continue;
        } catch {
            continue;
        }
        const [settings] = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, target));
        const locale = settings?.locale ?? "ru";
        const title = {
            ru: "Нужна помощь: задача заблокирована",
            en: "Help needed: task blocked",
            uz: "Yordam kerak: vazifa bloklangan",
        }[locale];
        const action = {
            ru: "Помогите устранить причину и снять блокировку.",
            en: "Help resolve the issue and unblock the task.",
            uz: "Muammoni hal qilib, vazifani blokdan chiqaring.",
        }[locale];
        const missing = {
            ru: "Причина пока не указана",
            en: "No reason recorded yet",
            uz: "Sabab hali ko‘rsatilmagan",
        }[locale];
        const key = `block:${task.id}:${task.blockedAt?.getTime() ?? task.updatedAt.getTime()}:${target}`;
        await db.transaction(async (tx) => {
            const [current] = await tx
                .select()
                .from(tasks)
                .where(eq(tasks.id, task.id));
            if (
                !current ||
                current.archivedAt ||
                current.status !== "blocked" ||
                current.blockedAt?.getTime() !== task.blockedAt?.getTime() ||
                current.helperId !== task.helperId ||
                current.assigneeId !== task.assigneeId
            )
                return;
            const inserted = await tx
                .insert(reminderDeliveries)
                .values({ key, taskId: task.id, userId: target })
                .onConflictDoNothing()
                .returning();
            if (!inserted.length) return;
            await tx.insert(notifications).values({
                userId: target,
                type: "system",
                title,
                body: `${task.title}: ${task.blockReason ?? missing}. ${action}`,
                entityType: "task",
                entityId: task.id,
                dedupeKey: key,
            });
            delivered++;
        });
    }
    return delivered;
}
