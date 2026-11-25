import { assistantReply } from "@/lib/ai/planner";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_HISTORY_MESSAGES = 20;

export const DEFAULT_GOOGLE_CHAT_BASE_URL =
    "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_GOOGLE_CHAT_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GOOGLE_CHAT_FALLBACKS = [
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
] as const;

export const FREE_GOOGLE_CHAT_MODELS = [
    {
        id: "gemini-3.5-flash-lite",
        label: "Google Gemini 3.5 Flash Lite (Free)",
    },
    {
        id: "gemini-3.1-flash-lite",
        label: "Google Gemini 3.1 Flash Lite (Free)",
    },
    {
        id: "gemini-3.5-flash",
        label: "Google Gemini 3.5 Flash (Free)",
    },
] as const;

const LEGACY_LOCAL_MODELS = new Set([
    "taskflow-rules-v1",
    "taskflow-pro",
    "taskflow-experimental",
]);

export type ChatHistoryMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type ChatTaskSummary = {
    open: number;
    overdue: number;
    completed: number;
    nextTask?: string;
    upcomingTasks?: Array<{
        title: string;
        priority: string;
        status: string;
        dueDate?: string | null;
    }>;
};

export type ChatReplyResult = {
    content: string;
    model: string;
    mode: "ai" | "rules";
};

function readChatConfig() {
    const apiKey = (
        process.env.AI_CHAT_API_KEY?.trim() || process.env.AI_API_KEY?.trim()
    );
    const baseUrl = (
        process.env.AI_CHAT_BASE_URL?.trim() ||
        process.env.AI_BASE_URL?.trim() ||
        DEFAULT_GOOGLE_CHAT_BASE_URL
    ).replace(/\/$/, "");

    const envChatModel = process.env.AI_CHAT_MODEL?.trim();
    const envFallbacks = (process.env.AI_CHAT_FALLBACK_MODELS ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const sharedModel = !process.env.AI_CHAT_BASE_URL?.trim() && process.env.AI_BASE_URL?.trim()
        ? process.env.AI_MODEL?.trim()
        : undefined;
    const model = envChatModel || sharedModel || DEFAULT_GOOGLE_CHAT_MODEL;
    const fallbackModels =
        envFallbacks.length > 0
            ? envFallbacks
            : baseUrl === DEFAULT_GOOGLE_CHAT_BASE_URL ? [...DEFAULT_GOOGLE_CHAT_FALLBACKS] : [];

    return {
        apiKey,
        baseUrl,
        model,
        fallbackModels,
    };
}

export function isLocalRulesModel(model?: string | null) {
    if (!model) return false;
    return model === "taskflow-rules-v1";
}

export function resolveDefaultChatModel(
    explicitModel?: string | null,
    settingsModel?: string | null,
) {
    const status = getAiChatStatus();
    const explicit = explicitModel?.trim();

    if (explicit === "taskflow-rules-v1") {
        return "taskflow-rules-v1";
    }

    if (status.configured) {
        if (explicit && !LEGACY_LOCAL_MODELS.has(explicit)) {
            return explicit;
        }
        const fromSettings = settingsModel?.trim();
        if (fromSettings && !LEGACY_LOCAL_MODELS.has(fromSettings)) {
            return fromSettings;
        }
        return status.model;
    }

    return "taskflow-rules-v1";
}

export function getAiChatStatus() {
    const { apiKey, model } = readChatConfig();
    const configured = Boolean(apiKey) && process.env.AI_MOCK !== "1";
    return {
        configured,
        mode: configured ? ("ai" as const) : ("rules" as const),
        model: configured ? model : "taskflow-rules-v1",
    };
}

function buildSystemPrompt(
    userName: string,
    summary: ChatTaskSummary,
): string {
    const taskLines = (summary.upcomingTasks ?? [])
        .slice(0, 5)
        .map(
            (task, idx) =>
                `${idx + 1}. "${task.title}" [${task.priority}, ${task.status}${task.dueDate ? `, due ${task.dueDate}` : ""}]`,
        )
        .join("\n");

    return [
        "You are TaskFlow AI, a helpful and friendly AI assistant powered by Google Gemini inside TaskFlowAI.",
        "You can chat freely with the user on any topic (everyday conversation, brainstorming, writing, coding, advice, explanations) as well as help with their tasks and planning.",
        "This conversation is read-only. Discuss ideas, ask clarifying questions and suggest next steps in plain text. If the user wants to apply changes, direct them to the task generator or task page. Never claim to have changed a task or created a proposal.",
        "Always reply in the same language the user writes in (Russian, Uzbek, English, etc.). Keep answers clear, natural, and concise unless the user asks for details.",
        "Only mention the user's workspace tasks when the user asks about tasks, schedule, priorities, workload, or planning. Never invent tasks that are not listed below.",
        "",
        `Current user: ${userName}`,
        `Workspace snapshot: open=${summary.open}, overdue=${summary.overdue}, completed=${summary.completed}${summary.nextTask ? `, nearest="${summary.nextTask}"` : ""}.`,
        taskLines ? `Top open tasks:\n${taskLines}` : "No open tasks listed.",
    ].join("\n");
}

function extractMessageText(rawContent: unknown): string {
    if (typeof rawContent === "string") {
        return rawContent.trim();
    }
    if (Array.isArray(rawContent)) {
        return rawContent
            .map((part) => {
                if (typeof part === "string") return part;
                if (
                    typeof part === "object" &&
                    part !== null &&
                    "text" in part
                ) {
                    return String((part as { text?: unknown }).text ?? "");
                }
                return "";
            })
            .join("")
            .trim();
    }
    return "";
}

export async function generateChatReply(input: {
    userName: string;
    preferredModel?: string | null;
    history: ChatHistoryMessage[];
    taskSummary: ChatTaskSummary;
    fetchImpl?: typeof fetch;
}): Promise<ChatReplyResult> {
    const fallbackText = () =>
        assistantReply({
            open: input.taskSummary.open,
            overdue: input.taskSummary.overdue,
            completed: input.taskSummary.completed,
            nextTask: input.taskSummary.nextTask,
        });

    if (isLocalRulesModel(input.preferredModel)) {
        return {
            content: fallbackText(),
            model: "taskflow-rules-v1",
            mode: "rules",
        };
    }

    const { apiKey, baseUrl, model, fallbackModels } = readChatConfig();
    if (!apiKey || process.env.AI_MOCK === "1") {
        return {
            content: fallbackText(),
            model: "taskflow-rules-v1",
            mode: "rules",
        };
    }

    const primaryModel =
        input.preferredModel && !LEGACY_LOCAL_MODELS.has(input.preferredModel)
            ? input.preferredModel
            : model;

    const attempts = [...new Set([primaryModel, model, ...fallbackModels])];
    const recentHistory = input.history
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .slice(-MAX_HISTORY_MESSAGES)
        .map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));

    const messages = [
        {
            role: "system" as const,
            content: buildSystemPrompt(input.userName, input.taskSummary),
        },
        ...recentHistory,
    ];

    const fetcher = input.fetchImpl ?? fetch;

    for (let index = 0; index < attempts.length; index += 1) {
        const currentModel = attempts[index];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetcher(`${baseUrl}/chat/completions`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer":
                        process.env.APP_URL ?? "https://taskflowai.app",
                    "X-Title": "TaskFlowAI Chat Assistant",
                },
                body: JSON.stringify({
                    model: currentModel,
                    temperature: 0.7,
                    max_tokens: 1536,
                    messages,
                }),
            });

            if (!response.ok) {
                if (
                    (response.status === 429 ||
                        response.status === 503 ||
                        response.status === 404) &&
                    index < attempts.length - 1
                ) {
                    continue;
                }
                if (process.env.NODE_ENV !== "production") {
                    const body = await response.text().catch(() => "");
                    console.warn(
                        `[ai-chat] provider error (${currentModel}, ${response.status}):`,
                        body.slice(0, 200),
                    );
                }
                continue;
            }

            const payload = (await response.json()) as {
                choices?: Array<{ message?: { content?: unknown } }>;
            };
            const content = extractMessageText(
                payload.choices?.[0]?.message?.content,
            );
            if (!content) {
                continue;
            }

            return {
                content,
                model: currentModel,
                mode: "ai",
            };
        } catch (error) {
            if (process.env.NODE_ENV !== "production") {
                console.warn(
                    `[ai-chat] request failed (${currentModel}):`,
                    error instanceof Error ? error.message : String(error),
                );
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    return {
        content: fallbackText(),
        model: "taskflow-rules-v1",
        mode: "rules",
    };
}
