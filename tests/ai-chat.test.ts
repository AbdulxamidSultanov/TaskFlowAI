import { test } from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_GOOGLE_CHAT_MODEL,
    generateChatReply,
    getAiChatStatus,
    resolveDefaultChatModel,
} from "../src/lib/ai/chat";

function withEnv(
    overrides: Record<string, string | undefined>,
    fn: () => Promise<void> | void,
) {
    const previous: Record<string, string | undefined> = {};
    for (const key of Object.keys(overrides)) {
        previous[key] = process.env[key];
        if (overrides[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = overrides[key];
        }
    }
    const restore = () => {
        for (const key of Object.keys(overrides)) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        }
    };
    const result = fn();
    if (result && typeof (result as Promise<void>).finally === "function") {
        return (result as Promise<void>).finally(restore);
    }
    restore();
}

test("AI chat falls back to rules when API key is absent or AI_MOCK=1", async () => {
    await withEnv(
        { AI_API_KEY: undefined, AI_CHAT_API_KEY: undefined, AI_MOCK: undefined },
        async () => {
            assert.equal(getAiChatStatus().configured, false);
            assert.equal(resolveDefaultChatModel(), "taskflow-rules-v1");
            const reply = await generateChatReply({
                userName: "Demo",
                history: [{ role: "user", content: "Привет!" }],
                taskSummary: { open: 2, overdue: 1, completed: 3, nextTask: "Ship v1" },
            });
            assert.equal(reply.mode, "rules");
            assert.equal(reply.model, "taskflow-rules-v1");
            assert.match(reply.content, /Ship v1/);
        },
    );

    await withEnv(
        { AI_API_KEY: "test-key", AI_MOCK: "1" },
        async () => {
            assert.equal(getAiChatStatus().configured, false);
            const reply = await generateChatReply({
                userName: "Demo",
                history: [{ role: "user", content: "Привет!" }],
                taskSummary: { open: 0, overdue: 0, completed: 1 },
            });
            assert.equal(reply.mode, "rules");
        },
    );
});

test("AI chat calls Google Gemini OpenAI-compatible API with history and returns reply", async () => {
    let capturedUrl = "";
    let capturedBody: {
        model?: string;
        messages?: Array<{ role: string; content: string }>;
    } = {};

    const mockFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
            JSON.stringify({
                choices: [
                    {
                        message: {
                            content: "Привет! Я Google Gemini, рад пообщаться.",
                        },
                    },
                ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    };

    await withEnv(
        {
            AI_API_KEY: "test-google-key",
            AI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
            AI_CHAT_MODEL: DEFAULT_GOOGLE_CHAT_MODEL,
            AI_MOCK: undefined,
        },
        async () => {
            assert.equal(getAiChatStatus().configured, true);
            assert.equal(
                resolveDefaultChatModel(undefined, "taskflow-rules-v1"),
                DEFAULT_GOOGLE_CHAT_MODEL,
            );
            assert.equal(
                resolveDefaultChatModel("taskflow-rules-v1", "gemini-3.5-flash-lite"),
                "taskflow-rules-v1",
            );
            assert.equal(
                resolveDefaultChatModel("taskflow-pro"),
                DEFAULT_GOOGLE_CHAT_MODEL,
            );

            const reply = await generateChatReply({
                userName: "Aziz",
                history: [
                    { role: "system", content: "old system prompt" },
                    { role: "user", content: "Привет!" },
                    { role: "assistant", content: "Привет, чем помочь?" },
                    { role: "user", content: "Расскажи короткую шутку про программистов" },
                ],
                taskSummary: { open: 1, overdue: 0, completed: 4, nextTask: "Review PR" },
                fetchImpl: mockFetch,
            });

            assert.equal(
                capturedUrl,
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            );
            assert.equal(capturedBody.model, DEFAULT_GOOGLE_CHAT_MODEL);
            assert.equal(capturedBody.messages?.[0]?.role, "system");
            assert.equal(capturedBody.messages?.length, 4);
            assert.match(capturedBody.messages?.[0]?.content ?? "", /read-only/);
            assert.equal(reply.mode, "ai");
            assert.equal(reply.model, DEFAULT_GOOGLE_CHAT_MODEL);
            assert.equal(reply.content, "Привет! Я Google Gemini, рад пообщаться.");
        },
    );
});

test("AI chat falls back to secondary Google Gemini model on 503 and to rules if all fail", async () => {
    const calledModels: string[] = [];

    const fallbackFetch: typeof fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
        calledModels.push(body.model);
        if (calledModels.length === 1) {
            return new Response("overloaded", { status: 503 });
        }
        return new Response(
            JSON.stringify({
                choices: [{ message: { content: "Ответ от резервной модели" } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    };

    await withEnv(
        {
            AI_API_KEY: "test-google-key",
            AI_CHAT_MODEL: "gemini-3.5-flash-lite",
            AI_CHAT_FALLBACK_MODELS: "gemini-3.1-flash-lite",
            AI_MOCK: undefined,
        },
        async () => {
            const reply = await generateChatReply({
                userName: "Demo",
                history: [{ role: "user", content: "Как дела?" }],
                taskSummary: { open: 1, overdue: 0, completed: 0 },
                fetchImpl: fallbackFetch,
            });

            assert.deepEqual(calledModels, [
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
            ]);
            assert.equal(reply.mode, "ai");
            assert.equal(reply.model, "gemini-3.1-flash-lite");
            assert.equal(reply.content, "Ответ от резервной модели");

            // Explicit offline mode does not hit network
            let calledOffline = false;
            const offlineReply = await generateChatReply({
                userName: "Demo",
                preferredModel: "taskflow-rules-v1",
                history: [{ role: "user", content: "Как дела?" }],
                taskSummary: { open: 0, overdue: 0, completed: 2 },
                fetchImpl: async () => {
                    calledOffline = true;
                    throw new Error("should not call fetch");
                },
            });
            assert.equal(calledOffline, false);
            assert.equal(offlineReply.mode, "rules");
        },
    );
});
