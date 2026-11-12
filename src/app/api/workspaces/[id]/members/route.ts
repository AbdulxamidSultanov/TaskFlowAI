import { visibleUserIds } from "@/lib/auth/scope";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
    userSettings,
    users,
    workspaceMembers,
    tasks,
    timeEntries,
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
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const url = new URL(request.url);
        const userId = requireString(url.searchParams.get("userId"), "userId");
        const input = await parseBody(request, workspaceMemberUpdateSchema);
        if (input.role === "owner")
            throw new ApiError(
                400,
                "Use ownership transfer",
                "OWNER_TRANSFER_REQUIRED",
            );

        const [membership] = await db
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

        const [updated] = await db
            .update(workspaceMembers)
            .set({ role: input.role })
            .where(eq(workspaceMembers.id, membership.id))
            .returning();

        return ok(updated);
    });
}

export async function DELETE(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const url = new URL(request.url);
        const userId = requireString(url.searchParams.get("userId"), "userId");

        if (userId === user.id) {
            throw new ApiError(
                400,
                "Use the leave-workspace flow to remove yourself",
                "CANNOT_REMOVE_SELF",
            );
        }

        const [membership] = await db
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
                "Transfer ownership before removing the owner",
                "CANNOT_REMOVE_OWNER",
            );
        }

        await db.transaction(async (tx) => {
            await tx
                .update(tasks)
                .set({ assigneeId: null, updatedAt: new Date() })
                .where(
                    and(
                        eq(tasks.workspaceId, id),
                        eq(tasks.assigneeId, userId),
                    ),
                );
            const entries = await tx
                .select({ id: timeEntries.id, startAt: timeEntries.startAt })
                .from(timeEntries)
                .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
                .where(
                    and(
                        eq(tasks.workspaceId, id),
                        eq(timeEntries.userId, userId),
                    ),
                );
            for (const entry of entries)
                await tx
                    .update(timeEntries)
                    .set({
                        endAt: new Date(
                            Math.max(Date.now(), entry.startAt.getTime() + 1),
                        ),
                    })
                    .where(
                        and(
                            eq(timeEntries.id, entry.id),
                            sql`${timeEntries.endAt} IS NULL`,
                        ),
                    );
            await tx
                .update(workspaceMembers)
                .set({ managerUserId: null })
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, id),
                        eq(workspaceMembers.managerUserId, userId),
                    ),
                );
            await tx
                .delete(workspaceMembers)
                .where(eq(workspaceMembers.id, membership.id));
        });

        return noContent();
    });
}
