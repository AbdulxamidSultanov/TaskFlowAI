import { requireTaskPermission } from "@/lib/auth/task-rights";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskActivity, taskDependencies, tasks, users } from "@/db/schema";
import { requireTaskAccess, taskScope } from "@/lib/auth/scope";
import type { AuthUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/http";
export async function getTaskExtras(user: AuthUser, id: string) {
    await requireTaskAccess(user, id);
    const activity = await db
        .select({
            id: taskActivity.id,
            action: taskActivity.action,
            changes: taskActivity.changes,
            createdAt: taskActivity.createdAt,
            actor: users.name,
        })
        .from(taskActivity)
        .leftJoin(users, eq(users.id, taskActivity.actorId))
        .where(eq(taskActivity.taskId, id))
        .orderBy(desc(taskActivity.createdAt))
        .limit(100);
    const dependencies = await db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
        .where(
            and(
                eq(taskDependencies.taskId, id),
                await taskScope(user, undefined, true),
            ),
        );
    return { activity, dependencies };
}
export async function addDependency(
    user: AuthUser,
    id: string,
    dependsOnId: string,
) {
    const { task } = await requireTaskPermission(
        user,
        id,
        "manageDependencies",
    );
    if (task.status === "completed" || task.archivedAt)
        throw new ApiError(
            409,
            "Reopen the task before adding dependencies",
            "TASK_CLOSED",
        );
    const dependency = await requireTaskAccess(user, dependsOnId);
    if (task.workspaceId !== dependency.workspaceId)
        throw new ApiError(
            422,
            "Dependencies must be in the same workspace",
            "INVALID_RELATION",
        );
    await db.transaction(async (tx) => {
        const graph = await tx
            .select()
            .from(taskDependencies)
            .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
            .where(eq(tasks.workspaceId, task.workspaceId));
        const stack = [dependsOnId];
        const seen = new Set<string>();
        while (stack.length) {
            const cursor = stack.pop()!;
            if (cursor === id)
                throw new ApiError(
                    422,
                    "Dependency cycle is not allowed",
                    "DEPENDENCY_CYCLE",
                );
            if (seen.has(cursor)) continue;
            seen.add(cursor);
            for (const edge of graph)
                if (edge.task_dependencies.taskId === cursor)
                    stack.push(edge.task_dependencies.dependsOnId);
        }
        await tx
            .insert(taskDependencies)
            .values({ taskId: id, dependsOnId })
            .onConflictDoNothing();
        await tx.insert(taskActivity).values({
            taskId: id,
            actorId: user.id,
            action: "dependency.added",
            changes: JSON.stringify({ dependsOnId }),
        });
    });
}
export async function removeDependency(
    user: AuthUser,
    id: string,
    dependsOnId: string,
) {
    await requireTaskPermission(user, id, "manageDependencies");
    await db.transaction(async (tx) => {
        await tx
            .delete(taskDependencies)
            .where(
                and(
                    eq(taskDependencies.taskId, id),
                    eq(taskDependencies.dependsOnId, dependsOnId),
                ),
            );
        await tx.insert(taskActivity).values({
            taskId: id,
            actorId: user.id,
            action: "dependency.removed",
            changes: JSON.stringify({ dependsOnId }),
        });
    });
}
