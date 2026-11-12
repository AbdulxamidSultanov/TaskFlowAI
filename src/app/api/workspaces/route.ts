import { visibleUserIds, projectScope, taskScope } from "@/lib/auth/scope";
import { asc, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { created, handleRoute, ok, parseBody } from "@/lib/api/http";
import { workspaceCreateSchema } from "@/lib/api/schemas";
import { getAccessibleWorkspaceIds } from "@/lib/auth/guards";
import { requireUser } from "@/lib/auth/session";

export async function GET() {
    return handleRoute(async () => {
        const user = await requireUser();
        const ids = await getAccessibleWorkspaceIds(user);

        if (ids.length === 0) {
            return ok([]);
        }

        const items = await db
            .select({
                id: workspaces.id,
                name: workspaces.name,
                slug: workspaces.slug,
                ownerId: workspaces.ownerId,
                plan: workspaces.plan,
                storageUsedBytes: workspaces.storageUsedBytes,
                storageLimitBytes: workspaces.storageLimitBytes,
                createdAt: workspaces.createdAt,
                updatedAt: workspaces.updatedAt,
                role: workspaceMembers.role,
                accessScope: workspaceMembers.accessScope,
                memberCount: sql<number>`(
                    select count(*) from workspace_members wm
                    where wm.workspace_id = ${workspaces.id} and wm.user_id in (select id from users where ${inArray(sql`id`, await visibleUserIds(user))})
                )`,
                projectCount: sql<number>`(
                    select count(*) from projects
                    where projects.workspace_id = ${workspaces.id} and ${await projectScope(user)}
                )`,
                taskCount: sql<number>`(
                    select count(*) from tasks
                    where tasks.workspace_id = ${workspaces.id} and ${await taskScope(user)}
                )`,
            })
            .from(workspaces)
            .leftJoin(
                workspaceMembers,
                sql`${workspaceMembers.workspaceId} = ${workspaces.id} and ${workspaceMembers.userId} = ${user.id}`,
            )
            .where(inArray(workspaces.id, ids))
            .orderBy(asc(workspaces.name));

        return ok(items);
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, workspaceCreateSchema);

        const workspace = await db.transaction(async (tx) => {
            const [workspace] = await tx
                .insert(workspaces)
                .values({
                    name: input.name,
                    slug: input.slug,
                    ownerId: user.id,
                    plan: input.plan ?? "free",
                })
                .returning();

            await tx.insert(workspaceMembers).values({
                workspaceId: workspace.id,
                userId: user.id,
                role: "owner",
            });

            return workspace;
        });

        return created(workspace);
    });
}
