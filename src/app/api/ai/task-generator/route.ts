import {ApiError, created, handleRoute, ok, parseBody, parseQuery} from "@/lib/api/http";
import {
    aiTaskGenerationSchema,
    workspaceIdQuerySchema,
} from "@/lib/api/schemas";
import {AiGenerationError, getAiGeneratorStatus} from "@/lib/ai/task-generator";
import {generateDrafts, generateStatusReview, listDrafts, proposeChatActions} from "@/lib/ai/task-drafts";
import {requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const query = await parseQuery(url, workspaceIdQuerySchema);
        const workspaceId = query.workspaceId;

        if (!workspaceId) {
            return ok({
                tasks: [],
                configured: getAiGeneratorStatus().configured,
                mode: getAiGeneratorStatus().mode,
                model: getAiGeneratorStatus().model,
            });
        }

        const tasks = await listDrafts(user, workspaceId);
        return ok({
            tasks,
            ...getAiGeneratorStatus(),
        });
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, aiTaskGenerationSchema);
        try {
            if (input.mode === "status-review") {
                return created(await generateStatusReview(user, {workspaceId: input.workspaceId}));
            }
            if (input.mode === "actions") {
                const {drafts, ...result} = await proposeChatActions(user, {
                    workspaceId: input.workspaceId,
                    messages: [{role: "user", content: input.prompt ?? ""}],
                    existingOnly: true,
                });
                return created({...result, tasks: drafts});
            }
            return created(await generateDrafts(user, {
                workspaceId: input.workspaceId,
                prompt: input.prompt ?? "",
                projectId: input.projectId,
            }));
        } catch (error) {
            if (error instanceof AiGenerationError) {
                const message = error.code === "AI_PROVIDER_ERROR"
                    ? "The AI provider could not complete the request"
                    : error.message;
                throw new ApiError(error.status, message, error.code);
            }
            throw error;
        }
    });
}
