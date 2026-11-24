import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
    taskActionRequests,
    taskParticipants,
    tasks,
    timeEntries,
    users,
    workspaceMembers,
    workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { visibleUserIds } from "@/lib/auth/scope";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import type { AuthUser } from "@/lib/auth/session";
export async function organizationTree(user: AuthUser, workspaceId: string) {
    const ids = await visibleUserIds(user, workspaceId);
    return db
        .select({
            id: users.id,
            name: users.name,
            jobTitle: users.jobTitle,
            departmentId: users.departmentId,
            managerUserId: workspaceMembers.managerUserId,
            accessScope: workspaceMembers.accessScope,
            role: workspaceMembers.role,
            completed: sql<number>`(select count(*) from tasks where assignee_id=${users.id} and workspace_id=${workspaceId} and status='completed' and archived_at is null)`,
            overdue: sql<number>`(select count(*) from tasks where assignee_id=${users.id} and workspace_id=${workspaceId} and status not in ('completed','cancelled') and due_date<${Date.now()} and archived_at is null)`,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
            and(
                eq(workspaceMembers.workspaceId, workspaceId),
                inArray(users.id, ids),
            ),
        );
}
export async function updateReportingLine(
    user: AuthUser,
    workspaceId: string,
    input: {
        userId: string;
        managerUserId: string | null;
        accessScope: "self" | "team" | "workspace";
    },
) {
    await requireWorkspaceMember(user, workspaceId, ["owner", "admin"]);
    return db.transaction(async (tx) => {
        const members = await tx
            .select()
            .from(workspaceMembers)
            .where(eq(workspaceMembers.workspaceId, workspaceId));
        const member = members.find((m) => m.userId === input.userId);
        if (!member) throw new ApiError(404, "Member not found", "NOT_FOUND");
        if (member.role === "owner" && input.managerUserId)
            throw new ApiError(
                422,
                "Owner must remain at the root",
                "OWNER_ROOT",
            );
        const seen = new Set([input.userId]);
        let cursor = input.managerUserId;
        while (cursor) {
            if (seen.has(cursor))
                throw new ApiError(
                    422,
                    "Reporting cycle is not allowed",
                    "ORG_CYCLE",
                );
            seen.add(cursor);
            const parent = members.find((m) => m.userId === cursor);
            if (!parent)
                throw new ApiError(
                    422,
                    "Manager must belong to workspace",
                    "INVALID_MANAGER",
                );
            cursor = parent.managerUserId;
        }
        await tx
            .update(workspaceMembers)
            .set({
                managerUserId: input.managerUserId,
                accessScope: input.accessScope,
            })
            .where(eq(workspaceMembers.id, member.id));
        return { updated: true };
    });
}
export async function transferOwnership(
    user: AuthUser,
    workspaceId: string,
    newOwnerId: string,
) {
    await db.transaction(async (tx) => {
        const { workspace } = await requireWorkspaceMember(
            user,
            workspaceId,
            ["owner"],
            tx,
        );
        if (workspace.ownerId !== user.id)
            throw new ApiError(
                403,
                "Only the current owner can transfer ownership",
                "FORBIDDEN",
            );
        if (newOwnerId === user.id) return;

        const [target] = await tx
            .select()
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.workspaceId, workspaceId),
                    eq(workspaceMembers.userId, newOwnerId),
                ),
            );
        if (!target) throw new ApiError(404, "Member not found", "NOT_FOUND");
        // Detach the new owner before reparenting the old root.
        await tx
            .update(workspaceMembers)
            .set({
                role: "owner",
                managerUserId: null,
                accessScope: "workspace",
            })
            .where(eq(workspaceMembers.id, target.id));
        await tx
            .update(workspaceMembers)
            .set({ role: "admin", managerUserId: newOwnerId })
            .where(
                and(
                    eq(workspaceMembers.workspaceId, workspaceId),
                    eq(workspaceMembers.userId, user.id),
                ),
            );
        await tx
            .update(workspaces)
            .set({ ownerId: newOwnerId, updatedAt: new Date() })
            .where(eq(workspaces.id, workspaceId));
    });
    return { updated: true };
}

export async function removeWorkspaceMember(
    actor: AuthUser,
    workspaceId: string,
    userId: string,
) {
    await db.transaction(async (tx) => {
        await requireWorkspaceMember(
            actor,
            workspaceId,
            ["owner", "admin"],
            tx,
        );
        if (userId === actor.id)
            throw new ApiError(
                400,
                "Use the leave-workspace flow to remove yourself",
                "CANNOT_REMOVE_SELF",
            );

        const workspaceMembership = and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId),
        );
        const [membership] = await tx
            .select({ role: workspaceMembers.role })
            .from(workspaceMembers)
            .where(workspaceMembership);
        if (!membership)
            throw new ApiError(404, "Membership not found", "NOT_FOUND");
        if (membership.role === "owner")
            throw new ApiError(
                400,
                "Transfer ownership before removing the owner",
                "CANNOT_REMOVE_OWNER",
            );

        const inWorkspace = eq(tasks.workspaceId, workspaceId);
        const taskIds = tx.select({ id: tasks.id }).from(tasks).where(inWorkspace);
        const now = new Date();
        await tx
            .update(timeEntries)
            .set({ endAt: sql`max(${now.getTime()}, ${timeEntries.startAt} + 1)` })
            .where(and(
                inArray(timeEntries.taskId, taskIds),
                eq(timeEntries.userId, userId),
                isNull(timeEntries.endAt),
            ));
        await tx
            .update(tasks)
            .set({ assigneeId: null, updatedAt: now })
            .where(and(inWorkspace, eq(tasks.assigneeId, userId)));
        await tx
            .update(tasks)
            .set({ reviewerId: null, updatedAt: now })
            .where(and(inWorkspace, eq(tasks.reviewerId, userId)));
        await tx
            .update(tasks)
            .set({ helperId: null, updatedAt: now })
            .where(and(inWorkspace, eq(tasks.helperId, userId)));
        await tx
            .update(taskActionRequests)
            .set({ resolvedAt: now })
            .where(and(
                inArray(taskActionRequests.taskId, taskIds),
                eq(taskActionRequests.targetUserId, userId),
                isNull(taskActionRequests.resolvedAt),
            ));
        await tx
            .delete(taskParticipants)
            .where(and(
                inArray(taskParticipants.taskId, taskIds),
                eq(taskParticipants.userId, userId),
            ));
        await tx
            .update(workspaceMembers)
            .set({ managerUserId: null })
            .where(and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(workspaceMembers.managerUserId, userId),
            ));
        await tx.delete(workspaceMembers).where(workspaceMembership);
    });
}
