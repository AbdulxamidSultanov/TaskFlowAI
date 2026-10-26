import {and, eq, inArray} from "drizzle-orm";

import {db} from "@/db";
import {workspaceMembers, workspaces} from "@/db/schema";
import {ApiError} from "@/lib/api/http";
import type {AuthUser} from "@/lib/auth/session";
import {requireRole} from "@/lib/auth/session";

export async function getWorkspaceIdsForUser(userId: string) {
    const rows = await db
        .select({workspaceId: workspaceMembers.workspaceId})
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId));

    return rows.map((row) => row.workspaceId);
}

export async function requireWorkspaceMember(
    user: AuthUser,
    workspaceId: string,
    allowedRoles: Array<"owner" | "admin" | "member" | "viewer"> = [
        "owner",
        "admin",
        "member",
    ],
) {
    const [membership] = await db
        .select({
            workspace: workspaces,
            role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
            and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(workspaceMembers.userId, user.id),
            ),
        )
        .limit(1);

    if (!membership) {
        throw new ApiError(403, "Workspace access denied", "FORBIDDEN");
    }

    if (!allowedRoles.includes(membership.role)) {
        throw new ApiError(
            403,
            "Your workspace role does not allow this action",
            "FORBIDDEN",
        );
    }

    return membership;
}

export async function requireAnyWorkspaceAccess(user: AuthUser) {
    const ids = await getWorkspaceIdsForUser(user.id);
    if (ids.length === 0) {
        throw new ApiError(
            403,
            "You are not a member of any workspace",
            "FORBIDDEN",
        );
    }
    return ids;
}

export async function getAccessibleWorkspaceIds(user: AuthUser) {
    if (user.role === "admin") {
        const rows = await db.select({id: workspaces.id}).from(workspaces);
        return rows.map((row) => row.id);
    }

    return getWorkspaceIdsForUser(user.id);
}

export async function assertWorkspaceIds(
    user: AuthUser,
    workspaceIds: string[],
) {
    if (workspaceIds.length === 0) {
        throw new ApiError(
            403,
            "You are not a member of any workspace",
            "FORBIDDEN",
        );
    }

    if (user.role === "admin") return;

    const allowed = await db
        .select({workspaceId: workspaceMembers.workspaceId})
        .from(workspaceMembers)
        .where(
            and(
                eq(workspaceMembers.userId, user.id),
                inArray(workspaceMembers.workspaceId, workspaceIds),
            ),
        );

    const allowedIds = new Set(allowed.map((row) => row.workspaceId));
    for (const workspaceId of workspaceIds) {
        if (!allowedIds.has(workspaceId)) {
            throw new ApiError(403, "Workspace access denied", "FORBIDDEN");
        }
    }
}

export function requireAdminOrManager(user: AuthUser) {
    requireRole(user, ["admin", "manager"]);
}
