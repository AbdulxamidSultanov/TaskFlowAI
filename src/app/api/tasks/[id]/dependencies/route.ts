import { z } from "zod";
import {
    handleRoute,
    noContent,
    parseBody,
    requireString,
} from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { addDependency, removeDependency } from "@/lib/services/task-extras";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
    return handleRoute(async () => {
        await addDependency(
            await requireUser(),
            (await params).id,
            (await parseBody(request, z.object({ dependsOnId: z.string() })))
                .dependsOnId,
        );
        return noContent();
    });
}
export async function DELETE(request: Request, { params }: Context) {
    return handleRoute(async () => {
        await removeDependency(
            await requireUser(),
            (await params).id,
            requireString(
                new URL(request.url).searchParams.get("dependsOnId"),
                "dependsOnId",
            ),
        );
        return noContent();
    });
}
