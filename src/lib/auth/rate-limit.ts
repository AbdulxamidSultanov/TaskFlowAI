import { createHash } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { authAttempts } from "@/db/schema";
import { ApiError } from "@/lib/api/http";
export async function limitAuthAttempt(email: string) {
    const key = createHash("sha256").update(email.toLowerCase()).digest("hex");
    await db.transaction(async (tx) => {
        const cutoff = new Date(Date.now() - 15 * 60000);
        await tx.delete(authAttempts).where(lt(authAttempts.createdAt, cutoff));
        const [row] = await tx
            .select({ n: count() })
            .from(authAttempts)
            .where(
                and(
                    eq(authAttempts.key, key),
                    gt(authAttempts.createdAt, cutoff),
                ),
            );
        if (row.n >= 20)
            throw new ApiError(
                429,
                "Too many attempts; retry in 15 minutes",
                "RATE_LIMITED",
            );
        await tx.insert(authAttempts).values({ key });
    });
}
