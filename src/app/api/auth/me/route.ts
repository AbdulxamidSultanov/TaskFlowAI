import {eq} from "drizzle-orm";

import {db} from "@/db";
import {userSettings, workspaceMembers, workspaces} from "@/db/schema";
import {handleRoute, ok} from "@/lib/api/http";
import {requireUser} from "@/lib/auth/session";

export async function GET() {
    return handleRoute(async () => {
        const user = await requireUser();

        let [settings] = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, user.id))
            .limit(1);

        if (!settings) {
            [settings] = await db
                .insert(userSettings)
                .values({userId: user.id})
                .returning();
        }

        const memberships = await db
            .select({
                role: workspaceMembers.role,
                joinedAt: workspaceMembers.joinedAt,
                workspace: {
                    id: workspaces.id,
                    name: workspaces.name,
                    slug: workspaces.slug,
                    plan: workspaces.plan,
                },
            })
            .from(workspaceMembers)
            .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
            .where(eq(workspaceMembers.userId, user.id));

        return ok({user, settings, memberships});
    });
}
