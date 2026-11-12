import { z } from "zod";
import { handleRoute, ok, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { transferOwnership } from "@/lib/services/organization";
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    return handleRoute(async () =>
        ok(
            await transferOwnership(
                await requireUser(),
                (await params).id,
                (await parseBody(request, z.object({ userId: z.string() })))
                    .userId,
            ),
        ),
    );
}
