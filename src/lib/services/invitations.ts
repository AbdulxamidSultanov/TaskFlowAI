import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { workspaceInvitations, workspaceMembers } from "@/db/schema";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import type { AuthUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/http";
export async function createInvitation(
    user: AuthUser,
    workspaceId: string,
    email: string,
    role: "member" | "viewer",
) {
    await requireWorkspaceMember(user, workspaceId, ["owner", "admin"]);
    const token = randomBytes(32).toString("base64url");
    const [row] = await db
        .insert(workspaceInvitations)
        .values({
            workspaceId,
            email: email.toLowerCase(),
            role,
            createdById: user.id,
            tokenHash: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 3 * 86400000),
        })
        .returning({
            id: workspaceInvitations.id,
            expiresAt: workspaceInvitations.expiresAt,
        });
    return { ...row, token };
}
export async function acceptInvitation(user: AuthUser, token: string) {
    return db.transaction(async (tx) => {
        const [invite] = await tx
            .select()
            .from(workspaceInvitations)
            .where(
                eq(
                    workspaceInvitations.tokenHash,
                    createHash("sha256").update(token).digest("hex"),
                ),
            );
        if (!invite || invite.expiresAt.getTime() <= Date.now())
            throw new ApiError(
                404,
                "Invitation expired or not found",
                "INVITATION_EXPIRED",
            );
        if (invite.email.toLowerCase() !== user.email.toLowerCase())
            throw new ApiError(
                403,
                "Sign in with the invited email",
                "INVITATION_EMAIL_MISMATCH",
            );
        const [existing] = await tx
            .select()
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.workspaceId, invite.workspaceId),
                    eq(workspaceMembers.userId, user.id),
                ),
            );
        if (invite.acceptedAt && !existing)
            throw new ApiError(
                409,
                "Invitation has already been used",
                "INVITATION_USED",
            );
        if (!existing)
            await tx.insert(workspaceMembers).values({
                workspaceId: invite.workspaceId,
                userId: user.id,
                role: invite.role,
            });
        await tx
            .update(workspaceInvitations)
            .set({ acceptedAt: new Date() })
            .where(
                and(
                    eq(workspaceInvitations.id, invite.id),
                    isNull(workspaceInvitations.acceptedAt),
                ),
            );
        return { workspaceId: invite.workspaceId };
    });
}
