import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
    departments,
    taskParticipants,
    taskActivity,
    taskActionRequests,
    timeEntries,
    tasks,
    users,
    workspaceMembers,
} from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { requireTaskPermission } from "@/lib/auth/task-rights";
import { requireTaskAccess, taskScope } from "@/lib/auth/scope";
import type { AuthUser } from "@/lib/auth/session";
export async function listTaskParticipants(user: AuthUser, id: string) {
    await requireTaskAccess(user, id);
    return db
        .select({
            id: taskParticipants.id,
            userId: users.id,
            name: users.name,
            role: taskParticipants.role,
            department: departments.name,
        })
        .from(taskParticipants)
        .innerJoin(users, eq(users.id, taskParticipants.userId))
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(eq(taskParticipants.taskId, id));
}
export async function participantCandidates(user: AuthUser, id: string) {
    const { task } = await requireTaskPermission(
        user,
        id,
        "manageParticipants",
    );
    return db
        .select({
            id: users.id,
            name: users.name,
            department: departments.name,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(
            and(
                eq(workspaceMembers.workspaceId, task.workspaceId),
                eq(users.isActive, true),
            ),
        )
        .orderBy(asc(users.name));
}
export async function setTaskParticipant(
    user: AuthUser,
    id: string,
    userId: string,
    role: "viewer" | "contributor" | null,
) {
    const { task } = await requireTaskPermission(
        user,
        id,
        "manageParticipants",
    );
    const { actorFor } = await import("./task-workflow");
    const target = await actorFor(userId);
    const base = target
        ? await db
              .select({ id: tasks.id })
              .from(tasks)
              .where(
                  and(
                      eq(tasks.id, id),
                      await taskScope(target, task.workspaceId, true, false),
                  ),
              )
        : [];
    await db.transaction(async (tx) => {
        const [membership] = await tx
            .select()
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.workspaceId, task.workspaceId),
                    eq(workspaceMembers.userId, userId),
                ),
            );
        if (!membership)
            throw new ApiError(
                422,
                "Invite the user to this workspace first",
                "NOT_WORKSPACE_MEMBER",
            );
        if (!base.length && role !== "contributor") {
            const running = await tx
                .select()
                .from(timeEntries)
                .where(
                    and(
                        eq(timeEntries.taskId, id),
                        eq(timeEntries.userId, userId),
                        isNull(timeEntries.endAt),
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
            await tx
                .update(tasks)
                .set({ reviewerId: null })
                .where(and(eq(tasks.id, id), eq(tasks.reviewerId, userId)));
            await tx
                .update(tasks)
                .set({ helperId: null })
                .where(and(eq(tasks.id, id), eq(tasks.helperId, userId)));
            await tx
                .update(taskActionRequests)
                .set({ resolvedAt: new Date() })
                .where(
                    and(
                        eq(taskActionRequests.taskId, id),
                        eq(taskActionRequests.targetUserId, userId),
                    ),
                );
        }
        if (role) {
            await tx
                .insert(taskParticipants)
                .values({ taskId: id, userId, role, addedById: user.id })
                .onConflictDoUpdate({
                    target: [taskParticipants.taskId, taskParticipants.userId],
                    set: { role, addedById: user.id },
                });
        } else {
            await tx
                .delete(taskParticipants)
                .where(
                    and(
                        eq(taskParticipants.taskId, id),
                        eq(taskParticipants.userId, userId),
                    ),
                );
        }
        await tx
            .insert(taskActivity)
            .values({
                taskId: id,
                actorId: user.id,
                action: role ? "participant.added" : "participant.removed",
                changes: JSON.stringify({ userId, role }),
            });
    });
    return listTaskParticipants(user, id);
}
