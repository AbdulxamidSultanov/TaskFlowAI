import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceInvitations } from "@/db/schema";
import {
    created,
    handleRoute,
    noContent,
    ok,
    parseBody,
    requireString,
} from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import { createInvitation } from "@/lib/services/invitations";
export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const id = requireString(
            new URL(request.url).searchParams.get("workspaceId"),
            "workspaceId",
        );
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        return ok(
            await db
                .select({
                    id: workspaceInvitations.id,
                    email: workspaceInvitations.email,
                    role: workspaceInvitations.role,
                    expiresAt: workspaceInvitations.expiresAt,
                    acceptedAt: workspaceInvitations.acceptedAt,
                })
                .from(workspaceInvitations)
                .where(eq(workspaceInvitations.workspaceId, id)),
        );
    });
}
export async function POST(request: Request) {
    return handleRoute(async () => {
        const body = await parseBody(
            request,
            z.object({
                workspaceId: z.string(),
                email: z.string().email(),
                role: z.enum(["member", "viewer"]).default("member"),
            }),
        );
        return created(
            await createInvitation(
                await requireUser(),
                body.workspaceId,
                body.email,
                body.role,
            ),
        );
    });
}
export async function DELETE(request: Request) {
    return handleRoute(async () => {
        const url = new URL(request.url);
        const workspaceId = requireString(
            url.searchParams.get("workspaceId"),
            "workspaceId",
        );
        await requireWorkspaceMember(await requireUser(), workspaceId, [
            "owner",
            "admin",
        ]);
        await db
            .delete(workspaceInvitations)
            .where(
                and(
                    eq(workspaceInvitations.workspaceId, workspaceId),
                    eq(
                        workspaceInvitations.id,
                        requireString(url.searchParams.get("id"), "id"),
                    ),
                ),
            );
        return noContent();
    });
}
