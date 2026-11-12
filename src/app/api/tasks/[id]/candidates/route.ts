import { handleRoute, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { participantCandidates } from "@/lib/services/task-participants";
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    return handleRoute(async () =>
        ok(await participantCandidates(await requireUser(), (await params).id)),
    );
}
