import { z } from "zod";
import { handleRoute, ok, parseBody, requireString } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import {
    listTaskParticipants,
    setTaskParticipant,
} from "@/lib/services/task-participants";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
    return handleRoute(async () =>
        ok(await listTaskParticipants(await requireUser(), (await params).id)),
    );
}
export async function POST(request: Request, { params }: Context) {
    return handleRoute(async () => {
        const input = await parseBody(
            request,
            z.object({
                userId: z.string(),
                role: z.enum(["viewer", "contributor"]),
            }),
        );
        return ok(
            await setTaskParticipant(
                await requireUser(),
                (await params).id,
                input.userId,
                input.role,
            ),
        );
    });
}
export async function DELETE(request: Request, { params }: Context) {
    return handleRoute(async () =>
        ok(
            await setTaskParticipant(
                await requireUser(),
                (await params).id,
                requireString(
                    new URL(request.url).searchParams.get("userId"),
                    "userId",
                ),
                null,
            ),
        ),
    );
}
