import {and, count, desc, eq, isNull} from "drizzle-orm";

import {db} from "@/db";
import {notifications} from "@/db/schema";
import {
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {getPagination, paginationMeta} from "@/lib/api/pagination";
import {notificationCreateSchema} from "@/lib/api/schemas";
import {requireRole, requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const pagination = getPagination(url);
        const unreadOnly = url.searchParams.get("unread") === "true";

        const where = unreadOnly
            ? and(
                  eq(notifications.userId, user.id),
                  isNull(notifications.readAt),
              )
            : eq(notifications.userId, user.id);

        const [items, totalRows, unreadRows] = await Promise.all([
            db
                .select()
                .from(notifications)
                .where(where)
                .orderBy(desc(notifications.createdAt))
                .limit(pagination.limit)
                .offset(pagination.offset),
            db
                .select({value: count()})
                .from(notifications)
                .where(where),
            db
                .select({value: count()})
                .from(notifications)
                .where(
                    and(
                        eq(notifications.userId, user.id),
                        isNull(notifications.readAt),
                    ),
                ),
        ]);

        return ok({
            items,
            unread: unreadRows[0]?.value ?? 0,
            pagination: paginationMeta(totalRows[0]?.value ?? 0, pagination),
        });
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        requireRole(user, ["admin", "manager"]);
        const input = await parseBody(request, notificationCreateSchema);

        const [notification] = await db
            .insert(notifications)
            .values({
                userId: input.userId,
                type: input.type ?? "system",
                title: input.title,
                body: input.body ?? null,
                entityType: input.entityType ?? null,
                entityId: input.entityId ?? null,
            })
            .returning();

        return created(notification);
    });
}
