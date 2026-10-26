import {eq} from "drizzle-orm";

import {db} from "@/db";
import {projects, tasks, users, workspaceMembers, workspaces} from "@/db/schema";
import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import {workspaceUpdateSchema} from "@/lib/api/schemas";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const {workspace, role} = await requireWorkspaceMember(user, id, [
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
                },
            })
            .from(workspaceMembers)
            .innerJoin(users, eq(users.id, workspaceMembers.userId))
            .where(eq(workspaceMembers.workspaceId, id));

        const projectRows = await db
            .select()
            .from(projects)
            .where(eq(projects.workspaceId, id));

        const taskCount = await db
            .select({id: tasks.id})
            .from(tasks)
            .where(eq(tasks.workspaceId, id));

        return ok({
            ...workspace,
            role,
            members,
            projects: projectRows,
            counts: {
                members: members.length,
                projects: projectRows.length,
                tasks: taskCount.length,
            },
        });
    });
}

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await requireWorkspaceMember(user, id, ["owner", "admin"]);
        const input = await parseBody(request, workspaceUpdateSchema);

        const [updated] = await db
            .update(workspaces)
            .set({
                ...(input.name === undefined ? {} : {name: input.name}),
                ...(input.plan === undefined ? {} : {plan: input.plan}),
                ...(input.storageUsedBytes === undefined
                    ? {}
                    : {storageUsedBytes: input.storageUsedBytes}),
                ...(input.storageLimitBytes === undefined
                    ? {}
                    : {storageLimitBytes: input.storageLimitBytes}),
                updatedAt: new Date(),
            })
            .where(eq(workspaces.id, id))
            .returning();

        if (!updated) {
            throw new ApiError(404, "Workspace not found", "NOT_FOUND");
        }

        return ok(updated);
    });
}

export async function DELETE(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const {workspace} = await requireWorkspaceMember(user, id, [
            "owner",
        ]);

        if (workspace.ownerId !== user.id && user.role !== "admin") {
            throw new ApiError(
                403,
                "Only the workspace owner can delete it",
                "FORBIDDEN",
            );
        }

        await db.delete(workspaces).where(eq(workspaces.id, id));
        return noContent();
    });
}
