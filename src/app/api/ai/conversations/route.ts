import {and, desc, eq} from "drizzle-orm";

import {db} from "@/db";
import {aiConversations, aiMessages} from "@/db/schema";
import {
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {aiConversationCreateSchema} from "@/lib/api/schemas";
import {requireWorkspaceMember} from "@/lib/auth/guards";
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
        await requireWorkspaceMember(user, input.workspaceId);

        const [conversation] = await db
            .insert(aiConversations)
            .values({
                workspaceId: input.workspaceId,
                userId: user.id,
                title: input.title ?? "New AI conversation",
                model: input.model ?? "taskflow-rules-v1",
            })
            .returning();

        await db.insert(aiMessages).values({
            conversationId: conversation.id,
            role: "system",
            content:
                "Ты — TaskFlow AI, помощник по планированию задач. Отвечай кратко, опирайся на данные рабочего пространства.",
        });

        return created(conversation);
    });
}
