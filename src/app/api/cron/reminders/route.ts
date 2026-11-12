import { timingSafeEqual } from "node:crypto";
import { ApiError, handleRoute, ok } from "@/lib/api/http";
import { deliverReminders } from "@/lib/services/notifications";

export const maxDuration = 300;
export async function GET(request: Request) {
    return handleRoute(async () => {
        const secret = process.env.CRON_SECRET;
        const actual = Buffer.from(request.headers.get("authorization") ?? "");
        const expected = Buffer.from(`Bearer ${secret ?? ""}`);
        if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
            throw new ApiError(401, "Unauthorized", "UNAUTHORIZED");
        return ok(await deliverReminders());
    });
}
