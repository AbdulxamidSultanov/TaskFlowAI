import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
    currentSessionHash,
    destroySession,
    requireUser,
} from "@/lib/auth/session";
import { handleRoute, noContent, ok } from "@/lib/api/http";
export async function GET() {
    return handleRoute(async () => {
        const user = await requireUser();
        const current = await currentSessionHash();
        const rows = await db
            .select()
            .from(sessions)
            .where(
                and(
                    eq(sessions.userId, user.id),
                    gt(sessions.expiresAt, new Date()),
                ),
            )
            .orderBy(desc(sessions.lastUsedAt));
        return ok(
            rows.map(
                ({
                    id,
                    createdAt,
                    lastUsedAt,
                    expiresAt,
                    userAgent,
                    tokenHash,
                }) => ({
                    id,
                    createdAt,
                    lastUsedAt,
                    expiresAt,
                    userAgent,
                    current: tokenHash === current,
                }),
            ),
        );
    });
}
export async function DELETE(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const id = new URL(request.url).searchParams.get("id");
        if (id) {
            await db
                .delete(sessions)
                .where(and(eq(sessions.userId, user.id), eq(sessions.id, id)));
        } else {
            await db.transaction(async (tx) => {
                await tx
                    .update(users)
                    .set({ sessionVersion: sql`${users.sessionVersion}+1` })
                    .where(eq(users.id, user.id));
                await tx.delete(sessions).where(eq(sessions.userId, user.id));
            });
            await destroySession();
        }
        return noContent();
    });
}
