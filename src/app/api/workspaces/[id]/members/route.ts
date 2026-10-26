import {and, eq} from "drizzle-orm";

import {db} from "@/db";
import {userSettings, users, workspaceMembers} from "@/db/schema";
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
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
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
            .where(eq(workspaceMembers.workspaceId, id));

        return ok(members);
    });
}

export async function POST(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const input = await parseBody(request, workspaceMemberAddSchema);

        const [memberUser] = await db
            .select({id: users.id})
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1);

        if (!memberUser) {
            throw new ApiError(404, "User not found", "NOT_FOUND");
        }

        const [existing] = await db
            .select({id: workspaceMembers.id})
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.workspaceId, id),
                    eq(workspaceMembers.userId, input.userId),
                ),
            )
            .limit(1);

        if (existing) {
            throw new ApiError(409, "User is already a member", "ALREADY_MEMBER");
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
            .values({userId: input.userId})
            .onConflictDoNothing();

        return created(membership);
    });
}

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const url = new URL(request.url);
        const userId = requireString(
            url.searchParams.get("userId"),
            "userId",
        );
        const input = await parseBody(request, workspaceMemberUpdateSchema);

        const [membership] = await db
            .select({id: workspaceMembers.id, role: workspaceMembers.role})
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

        if (membership.role === "owner" && input.role !== "owner") {
            throw new ApiError(
                400,
                "Transfer ownership before changing the owner role",
                "CANNOT_CHANGE_OWNER",
            );
        }

        const [updated] = await db
            .update(workspaceMembers)
            .set({role: input.role})
            .where(eq(workspaceMembers.id, membership.id))
            .returning();

        return ok(updated);
    });
}

export async function DELETE(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const url = new URL(request.url);
        const userId = requireString(
            url.searchParams.get("userId"),
            "userId",
        );

        if (userId === user.id) {
            throw new ApiError(
                400,
                "Use the leave-workspace flow to remove yourself",
                "CANNOT_REMOVE_SELF",
            );
        }

        const [membership] = await db
            .select({id: workspaceMembers.id, role: workspaceMembers.role})
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

        await db
            .delete(workspaceMembers)
            .where(eq(workspaceMembers.id, membership.id));

        return noContent();
    });
}
