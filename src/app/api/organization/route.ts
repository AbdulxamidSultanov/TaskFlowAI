import { z } from "zod";
import { handleRoute, ok, parseBody, requireString } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import {
    organizationTree,
    updateReportingLine,
} from "@/lib/services/organization";
export async function GET(request: Request) {
    return handleRoute(async () =>
        ok(
            await organizationTree(
                await requireUser(),
                requireString(
                    new URL(request.url).searchParams.get("workspaceId"),
                    "workspaceId",
                ),
            ),
        ),
    );
}
export async function PATCH(request: Request) {
    return handleRoute(async () => {
        const input = await parseBody(
            request,
            z.object({
                workspaceId: z.string(),
                userId: z.string(),
                managerUserId: z.string().nullable(),
                accessScope: z.enum(["self", "team", "workspace"]),
            }),
        );
        return ok(
            await updateReportingLine(
                await requireUser(),
                input.workspaceId,
                input,
            ),
        );
    });
}
