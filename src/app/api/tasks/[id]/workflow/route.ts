import { handleRoute, ok, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { applyTaskWorkflow, workflowInput } from "@/lib/services/task-workflow";
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    return handleRoute(async () =>
        ok(
            await applyTaskWorkflow(
                await requireUser(),
                (await params).id,
                await parseBody(request, workflowInput),
            ),
        ),
    );
}
