import {and, desc, eq, inArray} from "drizzle-orm";

import {db} from "@/db";
import {aiConversations, userSettings} from "@/db/schema";
import {resolveDefaultChatModel} from "@/lib/ai/chat";
import {
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {aiConversationCreateSchema} from "@/lib/api/schemas";
import {getAccessibleWorkspaceIds, requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const workspaceId = url.searchParams.get("workspaceId");

        if (workspaceId) {
            await requireWorkspaceMember(user, workspaceId, [
                "owner",
                "admin",
                "member",
                "viewer",
            ]);
        }

        const conditions = [eq(aiConversations.userId, user.id)];
        if (workspaceId) {
            conditions.push(eq(aiConversations.workspaceId, workspaceId));
        } else {
            conditions.push(inArray(aiConversations.workspaceId, await getAccessibleWorkspaceIds(user)));
        }

        const items = await db
            .select()
            .from(aiConversations)
            .where(and(...conditions))
            .orderBy(desc(aiConversations.updatedAt));

        return ok(items);
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, aiConversationCreateSchema);
        await requireWorkspaceMember(user, input.workspaceId, ["owner", "admin", "member", "viewer"]);

        const [settings] = await db
            .select({aiModel: userSettings.aiModel})
            .from(userSettings)
            .where(eq(userSettings.userId, user.id))
            .limit(1);

        const resolvedModel = resolveDefaultChatModel(
            input.model,
            settings?.aiModel,
        );

        const [conversation] = await db
            .insert(aiConversations)
            .values({
                workspaceId: input.workspaceId,
                userId: user.id,
                title: input.title ?? "New AI conversation",
                model: resolvedModel,
            })
            .returning();

        return created(conversation);
    });
}
