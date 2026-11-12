import {
    and,
    asc,
    eq,
    ne,
    isNull,
    lt,
    gt,
    or,
    inArray,
    sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
    aiPlanItems,
    aiPlans,
    projects,
    tasks,
    users,
    calendarEvents,
} from "@/db/schema";
import { dateAtHour } from "@/lib/time-zone";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import { ApiError } from "@/lib/api/http";
import { priorityWeight } from "@/lib/domain";

export type PlanInput = {
    userId: string;
    workspaceId: string;
    date?: string;
    availableMinutes?: number;
};

export async function generatePlan(input: PlanInput) {
    const availableMinutes = input.availableMinutes ?? 480;
    const [person] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId));
    if (!person?.isActive)
        throw new ApiError(403, "User unavailable", "FORBIDDEN");
    await requireWorkspaceMember(
        { ...person, department: null },
        input.workspaceId,
    );
    const baseDate = input.date ? new Date(input.date) : new Date();
    const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: person.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(baseDate);
    const dayStart = dateAtHour(date, person.timezone, 9);
    const dayEnd = dateAtHour(date, person.timezone, 18);
    const occupied = await db
        .select()
        .from(calendarEvents)
        .where(
            and(
                eq(calendarEvents.workspaceId, input.workspaceId),
                lt(calendarEvents.startAt, dayEnd),
                gt(calendarEvents.endAt, dayStart),
                or(
                    eq(calendarEvents.createdById, input.userId),
                    inArray(
                        calendarEvents.taskId,
                        db
                            .select({ id: tasks.id })
                            .from(tasks)
                            .where(
                                and(
                                    eq(tasks.workspaceId, input.workspaceId),
                                    eq(tasks.assigneeId, input.userId),
                                ),
                            ),
                    ),
                ),
            ),
        )
        .orderBy(asc(calendarEvents.startAt));

    const taskFields = {
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        estimateMinutes: tasks.estimateMinutes,
        projectId: tasks.projectId,
        projectName: projects.name,
        projectKey: projects.key,
    };

    const openTasks = await db
        .select(taskFields)
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(
            and(
                eq(tasks.workspaceId, input.workspaceId),
                eq(tasks.assigneeId, input.userId),
                ne(tasks.status, "completed"),
                ne(tasks.status, "cancelled"),
                ne(tasks.status, "blocked"),
                isNull(tasks.archivedAt),
                sql`${tasks.id} NOT IN (select d.task_id from task_dependencies d join tasks blocker on blocker.id=d.depends_on_id where blocker.status!='completed')`,
            ),
        )
        .orderBy(asc(tasks.dueDate));

    const sorted = openTasks.sort((a, b) => {
        const priorityDelta =
            priorityWeight(b.priority) - priorityWeight(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        const aDue = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
    });

    let cursor = new Date(dayStart);
    let usedMinutes = 0;
    const blocks: Array<{
        taskId: string;
        title: string;
        projectName: string;
        startAt: Date;
        endAt: Date;
        reason: string;
    }> = [];

    for (const task of sorted) {
        if (usedMinutes >= availableMinutes) break;

        const duration = Math.min(
            task.estimateMinutes && task.estimateMinutes > 0
                ? task.estimateMinutes
                : 45,
            Math.max(0, availableMinutes - usedMinutes),
        );

        if (cursor >= dayEnd) break;

        let endAt = new Date(cursor.getTime() + duration * 60_000);
        for (const event of occupied) {
            if (cursor < event.endAt && endAt > event.startAt) {
                cursor = new Date(event.endAt);
                endAt = new Date(cursor.getTime() + duration * 60000);
            }
        }
        if (endAt > dayEnd) continue;

        const reasons = [];
        if (task.priority === "urgent" || task.priority === "high") {
            reasons.push("high priority");
        }
        if (task.dueDate && task.dueDate < new Date()) {
            reasons.push("overdue");
        } else if (task.dueDate) {
            reasons.push("due soon");
        }
        if (task.status === "blocked") reasons.push("needs unblocking");
        if (reasons.length === 0) reasons.push("next best fit");

        blocks.push({
            taskId: task.id,
            title: task.title,
            projectName: task.projectName,
            startAt: new Date(cursor),
            endAt,
            reason: reasons.join(", "),
        });

        usedMinutes += duration;
        cursor = new Date(endAt.getTime() + 10 * 60_000);
    }

    const hours = Math.floor(usedMinutes / 60);
    const minutes = usedMinutes % 60;
    const summary =
        blocks.length === 0
            ? "No open tasks assigned to you. Your day is clear."
            : `${blocks.length} task${blocks.length === 1 ? "" : "s"} planned for ${hours}h${minutes ? ` ${minutes}m` : ""}.`;
    const rationale =
        "Rule-based plan: urgent and high-priority tasks first, then tasks with the nearest due date. " +
        "Each task gets its estimate (or 45 minutes by default), with a 10-minute buffer between blocks. Personal calendar events are excluded, blocked dependencies are skipped, and hours use the profile timezone.";

    const planId = await db.transaction(async (tx) => {
        const [plan] = await tx
            .insert(aiPlans)
            .values({
                workspaceId: input.workspaceId,
                userId: input.userId,
                date: dayStart,
                summary,
                rationale,
                availableMinutes,
            })
            .returning({ id: aiPlans.id });

        if (blocks.length) {
            await tx.insert(aiPlanItems).values(
                blocks.map((block, index) => ({
                    planId: plan.id,
                    taskId: block.taskId,
                    startAt: block.startAt,
                    endAt: block.endAt,
                    position: index,
                    reason: block.reason,
                })),
            );
        }

        return plan.id;
    });
    return getPlan(planId);
}

export async function getPlan(planId: string) {
    const [plan] = await db
        .select()
        .from(aiPlans)
        .where(eq(aiPlans.id, planId))
        .limit(1);

    if (!plan) return null;

    const items = await db
        .select({
            id: aiPlanItems.id,
            taskId: aiPlanItems.taskId,
            startAt: aiPlanItems.startAt,
            endAt: aiPlanItems.endAt,
            position: aiPlanItems.position,
            reason: aiPlanItems.reason,
            task: {
                id: tasks.id,
                title: tasks.title,
                status: tasks.status,
                priority: tasks.priority,
                dueDate: tasks.dueDate,
            },
            project: {
                id: projects.id,
                name: projects.name,
                key: projects.key,
            },
        })
        .from(aiPlanItems)
        .leftJoin(tasks, eq(tasks.id, aiPlanItems.taskId))
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(eq(aiPlanItems.planId, planId))
        .orderBy(asc(aiPlanItems.position));

    return { ...plan, items };
}

export function assistantReply(input: {
    open: number;
    overdue: number;
    completed: number;
    nextTask?: string;
}) {
    if (input.open === 0) {
        return "У вас нет открытых задач. Можно заняться планированием следующей недели или закрыть обзор аналитики.";
    }

    const lines = [
        `У вас ${input.open} открытых задач, из них просрочено: ${input.overdue}. Завершено: ${input.completed}.`,
    ];

    if (input.nextTask) {
        lines.push(`Следующий фокус: «${input.nextTask}».`);
    }

    lines.push(
        "Рекомендую начать с задач с высоким приоритетом и ближайшим дедлайном, затем перейти к задачам без срока. " +
            "Могу собрать план дня на вкладке AI Assistant.",
    );

    return lines.join("\n\n");
}
