import {handleRoute, ok, parseBody} from "@/lib/api/http";
import {aiTaskDraftUpdateSchema} from "@/lib/api/schemas";
import {rejectDraft, updateDraft} from "@/lib/ai/task-drafts";
import {requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const input = await parseBody(request, aiTaskDraftUpdateSchema);
        return ok(await updateDraft(user, id, input));
    });
}

export async function DELETE(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await rejectDraft(user, id);
        return ok({rejected: true});
    });
}
