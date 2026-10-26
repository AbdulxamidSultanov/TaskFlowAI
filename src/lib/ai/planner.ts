import {and, asc, eq, ne} from "drizzle-orm";

import {db} from "@/db";
import {aiPlanItems, aiPlans, projects, tasks} from "@/db/schema";
import {priorityWeight} from "@/lib/domain";

export type PlanInput = {
    userId: string;
    workspaceId: string;
    date?: string;
    availableMinutes?: number;
};

function atLocalHour(base: Date, hour: number, minute = 0) {
    const date = new Date(base);
    date.setHours(hour, minute, 0, 0);
    return date;
}

export async function generatePlan(input: PlanInput) {
    const availableMinutes = input.availableMinutes ?? 480;
    const baseDate = input.date ? new Date(input.date) : new Date();
    const dayStart = atLocalHour(baseDate, 9);
    const dayEnd = atLocalHour(baseDate, 18);

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

    let openTasks = await db
        .select(taskFields)
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(
            and(
                eq(tasks.workspaceId, input.workspaceId),
                eq(tasks.assigneeId, input.userId),
                ne(tasks.status, "completed"),
            ),
        )
        .orderBy(asc(tasks.dueDate));

    if (openTasks.length === 0) {
        openTasks = await db
            .select(taskFields)
            .from(tasks)
            .innerJoin(projects, eq(projects.id, tasks.projectId))
            .where(
                and(
                    eq(tasks.workspaceId, input.workspaceId),
                    ne(tasks.status, "completed"),
                ),
            )
            .orderBy(asc(tasks.dueDate))
            .limit(12);
    }

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
            task.estimateMinutes ?? 45,
            Math.max(15, availableMinutes - usedMinutes),
        );

        if (cursor >= dayEnd) break;

        const endAt = new Date(cursor.getTime() + duration * 60_000);
        if (endAt > dayEnd) break;

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
        "Each task gets its estimate (or 45 minutes by default), with a 10-minute buffer between blocks.";

    const [plan] = await db
        .insert(aiPlans)
        .values({
            workspaceId: input.workspaceId,
            userId: input.userId,
            date: dayStart,
            summary,
            rationale,
            availableMinutes,
        })
        .returning({id: aiPlans.id});

    if (blocks.length) {
        await db.insert(aiPlanItems).values(
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

    return getPlan(plan.id);
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

    return {...plan, items};
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
