import { visibleUserIds } from "@/lib/auth/scope";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
    userSettings,
    users,
    workspaceMembers,
} from "@/db/schema";
import {
    ApiError,
    created,
    handleRoute,
    noContent,
    ok,
    parseBody,
    requireString,
} from "@/lib/api/http";
import {
    workspaceMemberAddSchema,
    workspaceMemberUpdateSchema,
} from "@/lib/api/schemas";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import { requireUser } from "@/lib/auth/session";
import { removeWorkspaceMember } from "@/lib/services/organization";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        await requireWorkspaceMember(user, id, [
            "owner",
            "admin",
            "member",
            "viewer",
        ]);

        const members = await db
            .select({
                id: workspaceMembers.id,
                role: workspaceMembers.role,
                joinedAt: workspaceMembers.joinedAt,
                user: {
                    id: users.id,
                    name: users.name,
                    email: users.email,
                    avatarUrl: users.avatarUrl,
                    jobTitle: users.jobTitle,
                    departmentId: users.departmentId,
                },
            })
            .from(workspaceMembers)
            .innerJoin(users, eq(users.id, workspaceMembers.userId))
            .where(
                and(
                    eq(workspaceMembers.workspaceId, id),
                    inArray(users.id, await visibleUserIds(user, id)),
                ),
            );

        return ok(members);
    });
}

export async function POST(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const input = await parseBody(request, workspaceMemberAddSchema);
        if (input.role === "owner")
            throw new ApiError(
                400,
                "Use ownership transfer",
                "OWNER_TRANSFER_REQUIRED",
            );
        if (!(await visibleUserIds(user)).includes(input.userId))
            throw new ApiError(
                403,
                "Use an invitation for users outside your organization",
                "FORBIDDEN",
            );

        const [memberUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1);

        if (!memberUser) {
            throw new ApiError(404, "User not found", "NOT_FOUND");
        }

        const [existing] = await db
            .select({ id: workspaceMembers.id })
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.workspaceId, id),
                    eq(workspaceMembers.userId, input.userId),
                ),
            )
            .limit(1);

        if (existing) {
            throw new ApiError(
                409,
                "User is already a member",
                "ALREADY_MEMBER",
            );
        }

        const [membership] = await db
            .insert(workspaceMembers)
            .values({
                workspaceId: id,
                userId: input.userId,
                role: input.role ?? "member",
            })
            .returning();

        await db
            .insert(userSettings)
            .values({ userId: input.userId })
            .onConflictDoNothing();

        return created(membership);
    });
}

export async function PATCH(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const url = new URL(request.url);
        const userId = requireString(url.searchParams.get("userId"), "userId");
        const input = await parseBody(request, workspaceMemberUpdateSchema);
        if (input.role === "owner")
            throw new ApiError(
                400,
                "Use ownership transfer",
                "OWNER_TRANSFER_REQUIRED",
            );

        const updated = await db.transaction(async (tx) => {
            await requireWorkspaceMember(user, id, ["owner", "admin"], tx);
            const [membership] = await tx
                .select({ id: workspaceMembers.id, role: workspaceMembers.role })
                .from(workspaceMembers)
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, id),
                        eq(workspaceMembers.userId, userId),
                    ),
                )
                .limit(1);

            if (!membership) {
                throw new ApiError(404, "Membership not found", "NOT_FOUND");
            }

            if (membership.role === "owner") {
                throw new ApiError(
                    400,
                    "Transfer ownership before changing the owner role",
                    "CANNOT_CHANGE_OWNER",
                );
            }

            const [updatedMembership] = await tx
                .update(workspaceMembers)
                .set({ role: input.role })
                .where(eq(workspaceMembers.id, membership.id))
                .returning();
            return updatedMembership;
        });

        return ok(updated);
    });
}

export async function DELETE(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const url = new URL(request.url);
        const userId = requireString(url.searchParams.get("userId"), "userId");
        await removeWorkspaceMember(user, id, userId);
        return noContent();
    });
}
