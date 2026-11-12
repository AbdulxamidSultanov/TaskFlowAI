import { visibleUserIds } from "@/lib/auth/scope";
import {
    deliverReminders,
    notificationScope,
} from "@/lib/services/notifications";
import { and, count, desc, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ApiError, created, handleRoute, ok, parseBody } from "@/lib/api/http";
import { getPagination, paginationMeta } from "@/lib/api/pagination";
import { notificationCreateSchema } from "@/lib/api/schemas";
import { requireRole, requireUser } from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        await deliverReminders(new Date(), user.id);
        const url = new URL(request.url);
        const pagination = getPagination(url);
        const unreadOnly = url.searchParams.get("unread") === "true";

        const visible = await notificationScope(user);
        const where = and(
            visible,
            unreadOnly ? isNull(notifications.readAt) : undefined,
        );

        const [items, totalRows, unreadRows] = await Promise.all([
            db
                .select()
                .from(notifications)
                .where(where)
                .orderBy(desc(notifications.createdAt))
                .limit(pagination.limit)
                .offset(pagination.offset),
            db.select({ value: count() }).from(notifications).where(where),
            db
                .select({ value: count() })
                .from(notifications)
                .where(and(visible, isNull(notifications.readAt))),
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
        if (!(await visibleUserIds(user)).includes(input.userId))
            throw new ApiError(
                403,
                "Recipient is outside your scope",
                "FORBIDDEN",
            );

        if (input.entityType === "task" && input.entityId) {
            const { actorFor } = await import("@/lib/services/task-workflow");
            const { requireTaskAccess } = await import("@/lib/auth/scope");
            await requireTaskAccess(user, input.entityId);
            const target = await actorFor(input.userId);
            if (!target)
                throw new ApiError(403, "Recipient unavailable", "FORBIDDEN");
            await requireTaskAccess(target, input.entityId);
        }
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
