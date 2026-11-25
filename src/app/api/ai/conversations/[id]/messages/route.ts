import { taskScope } from "@/lib/auth/scope";
import { and, asc, count, desc, eq, lt, ne } from "drizzle-orm";

import { db } from "@/db";
import { aiConversations, aiMessages, tasks, userSettings } from "@/db/schema";
import {
    generateChatReply,
    getAiChatStatus,
    resolveDefaultChatModel,
} from "@/lib/ai/chat";
import { ApiError, created, handleRoute, ok, parseBody } from "@/lib/api/http";
import { aiMessageCreateSchema } from "@/lib/api/schemas";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
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

export async function POST(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const input = await parseBody(request, aiMessageCreateSchema);
        const conversation = await requireConversation(user.id, id);
        const workspaceId = conversation.workspaceId;
        await requireWorkspaceMember(user, workspaceId, ["owner", "admin", "member", "viewer"]);
        const chatStatus = getAiChatStatus();
        if (!chatStatus.configured && input.model !== "taskflow-rules-v1") {
            throw new ApiError(503, "Configure the chat provider to start a discussion", "CHAT_NOT_CONFIGURED");
        }
        const scope = await taskScope(user, workspaceId);
        const now = new Date();
        const [
            openRows,
            overdueRows,
            completedRows,
            upcomingRows,
            historyRows,
            settingsRows,
        ] = await Promise.all([
            db
                .select({ value: count() })
                .from(tasks)
                .where(
                    and(
                        scope,
                        eq(tasks.workspaceId, workspaceId),
                        ne(tasks.status, "completed"),
                        ne(tasks.status, "cancelled"),
                    ),
                ),
            db
                .select({ value: count() })
                .from(tasks)
                .where(
                    and(
                        scope,
                        eq(tasks.workspaceId, workspaceId),
                        lt(tasks.dueDate, now),
                        ne(tasks.status, "completed"),
                        ne(tasks.status, "cancelled"),
                    ),
                ),
            db
                .select({ value: count() })
                .from(tasks)
                .where(
                    and(
                        scope,
                        eq(tasks.workspaceId, workspaceId),
                        eq(tasks.status, "completed"),
                    ),
                ),
            db
                .select({
                    title: tasks.title,
                    priority: tasks.priority,
                    status: tasks.status,
                    dueDate: tasks.dueDate,
                })
                .from(tasks)
                .where(
                    and(
                        scope,
                        eq(tasks.workspaceId, workspaceId),
                        ne(tasks.status, "completed"),
                        ne(tasks.status, "cancelled"),
                    ),
                )
                .orderBy(asc(tasks.dueDate))
                .limit(5),
            db
                .select({
                    role: aiMessages.role,
                    content: aiMessages.content,
                })
                .from(aiMessages)
                .where(eq(aiMessages.conversationId, id))
                .orderBy(desc(aiMessages.createdAt))
                .limit(20),
            db
                .select({ aiModel: userSettings.aiModel })
                .from(userSettings)
                .where(eq(userSettings.userId, user.id))
                .limit(1),
        ]);

        const orderedHistory = [...historyRows].reverse();
        // Respect an explicit model choice on the message first; otherwise if an
        // older conversation was seeded with taskflow-rules-v1 while Google
        // Gemini is configured, upgrade the reply to the live AI model.
        const preferredModel =
            input.model ??
            (conversation.model === "taskflow-rules-v1" && chatStatus.configured
                ? resolveDefaultChatModel(undefined, settingsRows[0]?.aiModel)
                : conversation.model);

        const reply = await generateChatReply({
            userName: user.name,
            preferredModel,
            history: [...orderedHistory, { role: "user", content: input.content }],
            taskSummary: {
                open: openRows[0]?.value ?? 0,
                overdue: overdueRows[0]?.value ?? 0,
                completed: completedRows[0]?.value ?? 0,
                nextTask: upcomingRows[0]?.title,
                upcomingTasks: upcomingRows.map((row) => ({
                    title: row.title,
                    priority: row.priority,
                    status: row.status,
                    dueDate: row.dueDate
                        ? row.dueDate.toISOString().slice(0, 10)
                        : null,
                })),
            },
        });

        if (reply.mode === "rules" && input.model !== "taskflow-rules-v1") {
            throw new ApiError(503, "The chat provider is unavailable. Try again.", "CHAT_UNAVAILABLE");
        }

        const turn = await db.transaction(async (tx) => {
            await requireWorkspaceMember(user, workspaceId, ["owner", "admin", "member", "viewer"], tx);
            const [userMessage] = await tx.insert(aiMessages).values({
                conversationId: id, role: "user", content: input.content,
            }).returning();
            const [assistantMessage] = await tx.insert(aiMessages).values({
                conversationId: id, role: "assistant", content: reply.content,
                createdAt: new Date(Math.max(Date.now(), userMessage.createdAt.getTime() + 1)),
            }).returning();
            await tx.update(aiConversations)
                .set({ model: reply.model, updatedAt: assistantMessage.createdAt })
                .where(eq(aiConversations.id, id));
            return { userMessage, assistantMessage };
        });
        return created({ ...turn, model: reply.model, mode: reply.mode, proposals: [] });
    });
}
