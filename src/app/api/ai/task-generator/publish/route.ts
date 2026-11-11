import {created, handleRoute, parseBody} from "@/lib/api/http";
import {aiTaskPublishSchema} from "@/lib/api/schemas";
import {publishDrafts} from "@/lib/ai/task-drafts";
import {requireUser} from "@/lib/auth/session";

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, aiTaskPublishSchema);
        const published = await publishDrafts(
            user,
            input.workspaceId,
            input.draftIds,
        );
        return created({published});
    });
}
