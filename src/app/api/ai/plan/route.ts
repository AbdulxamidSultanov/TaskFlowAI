import {and, desc, eq} from "drizzle-orm";

import {db} from "@/db";
import {aiPlans} from "@/db/schema";
import {created, handleRoute, ok, parseBody} from "@/lib/api/http";
import {aiPlanRequestSchema} from "@/lib/api/schemas";
import {generatePlan, getPlan} from "@/lib/ai/planner";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const workspaceId = url.searchParams.get("workspaceId");

        const conditions = [eq(aiPlans.userId, user.id)];
        if (workspaceId) {
            await requireWorkspaceMember(user, workspaceId, [
                "owner",
                "admin",
                "member",
                "viewer",
            ]);
            conditions.push(eq(aiPlans.workspaceId, workspaceId));
        }

        const rows = await db
            .select()
            .from(aiPlans)
            .where(and(...conditions))
            .orderBy(desc(aiPlans.createdAt))
            .limit(10);

        return ok(await Promise.all(rows.map((row) => getPlan(row.id))));
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, aiPlanRequestSchema);
        await requireWorkspaceMember(user, input.workspaceId);

        const plan = await generatePlan({
            userId: user.id,
            workspaceId: input.workspaceId,
            date: input.date,
            availableMinutes: input.availableMinutes,
        });

        return created(plan);
    });
}
