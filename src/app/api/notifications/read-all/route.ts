import { notificationScope } from "@/lib/services/notifications";
import { and, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { handleRoute, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";

export async function POST() {
    return handleRoute(async () => {
        const user = await requireUser();
        const now = new Date();

        await db
            .update(notifications)
            .set({ readAt: now })
            .where(
                and(
                    await notificationScope(user),
                    isNull(notifications.readAt),
                ),
            );

        return ok({ readAt: now });
    });
}
