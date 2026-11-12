import { z } from "zod";
import { handleRoute, ok, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { acceptInvitation } from "@/lib/services/invitations";
export async function POST(request: Request) {
    return handleRoute(async () =>
        ok(
            await acceptInvitation(
                await requireUser(),
                (
                    await parseBody(
                        request,
                        z.object({ token: z.string().min(16).max(200) }),
                    )
                ).token,
            ),
        ),
    );
}
