import {sql} from "drizzle-orm";

import {db} from "@/db";
import {handleRoute, ok} from "@/lib/api/http";

export async function GET() {
    return handleRoute(async () => {
        const startedAt = Date.now();
        await db.run(sql`select 1`);

        return ok({
            status: "ok",
            database: "up",
            latencyMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
        });
    });
}
