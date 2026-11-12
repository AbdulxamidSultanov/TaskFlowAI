import { handleRoute, ok, parseQuery } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { getTimeReport, reportQuery } from "@/lib/services/time-tracking";
export async function GET(request: Request) {
    return handleRoute(async () =>
        ok(
            await getTimeReport(
                await requireUser(),
                await parseQuery(new URL(request.url), reportQuery),
            ),
        ),
    );
}
