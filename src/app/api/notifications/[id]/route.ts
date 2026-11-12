import { notificationScope } from "@/lib/services/notifications";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ApiError, handleRoute, noContent, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const [notification] = await db
            .select()
            .from(notifications)
            .where(and(eq(notifications.id, id), await notificationScope(user)))
            .limit(1);

        if (!notification) {
            throw new ApiError(404, "Notification not found", "NOT_FOUND");
        }

        if (notification.userId !== user.id && user.role !== "admin") {
            throw new ApiError(403, "Insufficient permissions", "FORBIDDEN");
        }

        const [updated] = await db
            .update(notifications)
            .set({ readAt: notification.readAt ?? new Date() })
            .where(and(eq(notifications.id, id), await notificationScope(user)))
            .returning();

        return ok(updated);
    });
}

export async function DELETE(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const { id } = await params;
        const [notification] = await db
            .select({ userId: notifications.userId })
            .from(notifications)
            .where(and(eq(notifications.id, id), await notificationScope(user)))
            .limit(1);

        if (!notification) {
            throw new ApiError(404, "Notification not found", "NOT_FOUND");
        }

        if (notification.userId !== user.id && user.role !== "admin") {
            throw new ApiError(403, "Insufficient permissions", "FORBIDDEN");
        }

        await db
            .delete(notifications)
            .where(
                and(eq(notifications.id, id), await notificationScope(user)),
            );
        return noContent();
    });
}
