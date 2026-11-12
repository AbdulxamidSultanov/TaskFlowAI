import { handleRoute, noContent, ok, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import {
    deleteTimeEntry,
    stopTimeEntry,
    stopInput,
} from "@/lib/services/time-tracking";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) {
    return handleRoute(async () =>
        ok(
            await stopTimeEntry(
                await requireUser(),
                (await params).id,
                await parseBody(request, stopInput),
            ),
        ),
    );
}
export async function DELETE(_request: Request, { params }: Context) {
    return handleRoute(async () => {
        await deleteTimeEntry(await requireUser(), (await params).id);
        return noContent();
    });
}
