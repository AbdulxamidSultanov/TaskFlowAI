import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskParticipants, workspaceMembers, type Task } from "@/db/schema";
import { ApiError } from "@/lib/api/http";
import { requireWorkspaceMember } from "./guards";
import { requireTaskAccess, workspaceScope } from "./scope";
import type { AuthUser } from "./session";
export type TaskPermissions = {
    view: boolean;
    edit: boolean;
    status: boolean;
    assign: boolean;
    changeDeadline: boolean;
    manageParticipants: boolean;
    manageDependencies: boolean;
    review: boolean;
    delete: boolean;
    comment: boolean;
    upload: boolean;
    trackTime: boolean;
    block: boolean;
    unblock: boolean;
};
export async function taskPermissions(
    user: AuthUser,
    task: Task,
): Promise<TaskPermissions> {
    const membership = await requireWorkspaceMember(user, task.workspaceId, [
        "owner",
        "admin",
        "member",
        "viewer",
    ]);
    const [own] = await db
        .select()
        .from(workspaceMembers)
        .where(
            and(
                eq(workspaceMembers.workspaceId, task.workspaceId),
                eq(workspaceMembers.userId, user.id),
            ),
        );
    const scope = await workspaceScope(user, task.workspaceId);
    const admin = membership.role === "owner" || membership.role === "admin";
    const supervisor =
        own?.accessScope === "team" &&
        ((task.assigneeId === user.id && task.creatorId === user.id) ||
            (task.assigneeId !== user.id &&
                task.assigneeId !== null &&
                scope !== null &&
                scope.includes(task.assigneeId)));
    const manager = membership.role !== "viewer" && (admin || supervisor);
    const [participant] = await db
        .select()
        .from(taskParticipants)
        .where(
            and(
                eq(taskParticipants.taskId, task.id),
                eq(taskParticipants.userId, user.id),
            ),
        );
    const worker = membership.role !== "viewer" && task.assigneeId === user.id;
    const contribute =
        membership.role !== "viewer" &&
        (manager || worker || participant?.role === "contributor");
    return {
        view: true,
        edit: manager || worker,
        status: manager || worker,
        assign: manager,
        changeDeadline: manager,
        manageParticipants: manager,
        manageDependencies: manager,
        review:
            membership.role !== "viewer" &&
            task.assigneeId !== user.id &&
            (manager || (task.reviewerId === user.id && contribute)),
        delete: manager,
        comment: contribute,
        upload: contribute,
        trackTime: contribute,
        block: contribute,
        unblock:
            contribute &&
            (manager ||
                task.blockedById === user.id ||
                task.helperId === user.id),
    };
}
export async function requireTaskPermission(
    user: AuthUser,
    id: string,
    action: keyof TaskPermissions,
) {
    const task = await requireTaskAccess(user, id);
    const permissions = await taskPermissions(user, task);
    if (!permissions[action])
        throw new ApiError(
            403,
            "This action is not allowed for this task",
            "FORBIDDEN",
        );
    return { task, permissions };
}
