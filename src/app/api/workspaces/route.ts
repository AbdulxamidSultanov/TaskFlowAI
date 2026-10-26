import {asc, inArray, sql} from "drizzle-orm";

import {db} from "@/db";
import {workspaceMembers, workspaces} from "@/db/schema";
import {
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {workspaceCreateSchema} from "@/lib/api/schemas";
import {getAccessibleWorkspaceIds} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

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
                memberCount: sql<number>`(
                    select count(*) from workspace_members wm
                    where wm.workspace_id = ${workspaces.id}
                )`,
                projectCount: sql<number>`(
                    select count(*) from projects p
                    where p.workspace_id = ${workspaces.id}
                )`,
                taskCount: sql<number>`(
                    select count(*) from tasks t
                    where t.workspace_id = ${workspaces.id}
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

        const [workspace] = await db
            .insert(workspaces)
            .values({
                name: input.name,
                slug: input.slug,
                ownerId: user.id,
                plan: input.plan ?? "free",
            })
            .returning();

        await db.insert(workspaceMembers).values({
            workspaceId: workspace.id,
            userId: user.id,
            role: "owner",
        });

        return created(workspace);
    });
}
