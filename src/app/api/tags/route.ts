import {asc, eq} from "drizzle-orm";

import {db} from "@/db";
import {tags} from "@/db/schema";
import {
    ApiError,
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {tagCreateSchema} from "@/lib/api/schemas";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const workspaceId = url.searchParams.get("workspaceId");

        if (!workspaceId) {
            throw new ApiError(
                400,
                'Missing "workspaceId"',
                "MISSING_PARAMETER",
            );
        }

        await requireWorkspaceMember(user, workspaceId, [
            "owner",
            "admin",
            "member",
            "viewer",
        ]);

        const items = await db
            .select()
            .from(tags)
            .where(eq(tags.workspaceId, workspaceId))
            .orderBy(asc(tags.name));

        return ok(items);
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, tagCreateSchema);
        await requireWorkspaceMember(user, input.workspaceId);

        const [tag] = await db
            .insert(tags)
            .values({
                workspaceId: input.workspaceId,
                name: input.name,
                color: input.color ?? "#64748B",
            })
            .returning();

        return created(tag);
    });
}
