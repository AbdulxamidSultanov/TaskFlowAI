import { handleRoute, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { getTaskExtras } from "@/lib/services/task-extras";
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    return handleRoute(async () =>
        ok(await getTaskExtras(await requireUser(), (await params).id)),
    );
}
