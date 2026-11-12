import { created, handleRoute, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { createTimeEntry, entryInput } from "@/lib/services/time-tracking";
export async function POST(request: Request) {
    return handleRoute(async () =>
        created(
            await createTimeEntry(
                await requireUser(),
                await parseBody(request, entryInput),
            ),
        ),
    );
}
