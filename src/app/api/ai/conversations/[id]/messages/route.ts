import {and, asc, count, eq, lt, ne} from "drizzle-orm";

import {db} from "@/db";
import {aiConversations, aiMessages, tasks} from "@/db/schema";
import {
    ApiError,
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {aiMessageCreateSchema} from "@/lib/api/schemas";
import {assistantReply} from "@/lib/ai/planner";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};

async function requireConversation(userId: string, conversationId: string) {
    const [conversation] = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.id, conversationId))
        .limit(1);

    if (!conversation) {
        throw new ApiError(404, "Conversation not found", "NOT_FOUND");
    }

    if (conversation.userId !== userId) {
        throw new ApiError(403, "Conversation access denied", "FORBIDDEN");
    }

    return conversation;
}

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const conversation = await requireConversation(user.id, id);
        await requireWorkspaceMember(user, conversation.workspaceId, [
            "owner",
            "admin",
            "member",
            "viewer",
        ]);

        const items = await db
            .select()
            .from(aiMessages)
            .where(eq(aiMessages.conversationId, id))
            .orderBy(asc(aiMessages.createdAt));

        return ok(items);
    });
}

export async function POST(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const input = await parseBody(request, aiMessageCreateSchema);
        const conversation = await requireConversation(user.id, id);
        await requireWorkspaceMember(user, conversation.workspaceId);

        const [userMessage] = await db
            .insert(aiMessages)
            .values({
                conversationId: id,
                role: "user",
                content: input.content,
            })
            .returning();

        const workspaceId = conversation.workspaceId;
        const now = new Date();
        const [openRows, overdueRows, completedRows, nextRows] = await Promise.all([
            db
                .select({value: count()})
                .from(tasks)
                .where(
                    and(
                        eq(tasks.workspaceId, workspaceId),
                        ne(tasks.status, "completed"),
                    ),
                ),
            db
                .select({value: count()})
                .from(tasks)
                .where(
                    and(
                        eq(tasks.workspaceId, workspaceId),
                        lt(tasks.dueDate, now),
                        ne(tasks.status, "completed"),
                    ),
                ),
            db
                .select({value: count()})
                .from(tasks)
                .where(
                    and(
                        eq(tasks.workspaceId, workspaceId),
                        eq(tasks.status, "completed"),
                    ),
                ),
            db
                .select({title: tasks.title})
                .from(tasks)
                .where(
                    and(
                        eq(tasks.workspaceId, workspaceId),
                        ne(tasks.status, "completed"),
                    ),
                )
                .orderBy(asc(tasks.dueDate))
                .limit(1),
        ]);

        const [assistantMessage] = await db
            .insert(aiMessages)
            .values({
                conversationId: id,
                role: "assistant",
                content: assistantReply({
                    open: openRows[0]?.value ?? 0,
                    overdue: overdueRows[0]?.value ?? 0,
                    completed: completedRows[0]?.value ?? 0,
                    nextTask: nextRows[0]?.title,
                }),
            })
            .returning();

        await db
            .update(aiConversations)
            .set({updatedAt: new Date()})
            .where(eq(aiConversations.id, id));

        return created({userMessage, assistantMessage});
    });
}
