import {created, handleRoute, ok, parseBody, parseQuery} from "@/lib/api/http";
import {
    aiTaskGenerationSchema,
    workspaceIdQuerySchema,
} from "@/lib/api/schemas";
import {getAiGeneratorStatus} from "@/lib/ai/task-generator";
import {generateDrafts, listDrafts} from "@/lib/ai/task-drafts";
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
        const result = await generateDrafts(user, input);
        return created(result);
    });
}
