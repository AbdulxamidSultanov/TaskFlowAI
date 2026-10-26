import {eq} from "drizzle-orm";

import {db} from "@/db";
import {userSettings} from "@/db/schema";
import {handleRoute, ok, parseBody} from "@/lib/api/http";
import {settingsUpdateSchema} from "@/lib/api/schemas";
import {requireUser} from "@/lib/auth/session";

async function getOrCreateSettings(userId: string) {
    let [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

    if (!settings) {
        [settings] = await db
            .insert(userSettings)
            .values({userId})
            .returning();
    }

    return settings;
}

export async function GET() {
    return handleRoute(async () => {
        const user = await requireUser();
        return ok(await getOrCreateSettings(user.id));
    });
}

export async function PATCH(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        await getOrCreateSettings(user.id);
        const input = await parseBody(request, settingsUpdateSchema);

        const [settings] = await db
            .update(userSettings)
            .set({
                ...(input.theme === undefined ? {} : {theme: input.theme}),
                ...(input.locale === undefined ? {} : {locale: input.locale}),
                ...(input.dailySummaryEmail === undefined
                    ? {}
                    : {dailySummaryEmail: input.dailySummaryEmail}),
                ...(input.overduePush === undefined
                    ? {}
                    : {overduePush: input.overduePush}),
                ...(input.teamMentions === undefined
                    ? {}
                    : {teamMentions: input.teamMentions}),
                ...(input.aiModel === undefined
                    ? {}
                    : {aiModel: input.aiModel}),
                updatedAt: new Date(),
            })
            .where(eq(userSettings.userId, user.id))
            .returning();

        return ok(settings);
    });
}
