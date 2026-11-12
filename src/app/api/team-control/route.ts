import { handleRoute, ok, parseQuery } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { boardQuery, getDayBoard } from "@/lib/services/day-board";
export async function GET(request: Request) {
    return handleRoute(async () =>
        ok(
            await getDayBoard(
                await requireUser(),
                await parseQuery(new URL(request.url), boardQuery),
                true,
            ),
        ),
    );
}
