import { requireTaskPermission } from "@/lib/auth/task-rights";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taskAttachments } from "@/db/schema";
import { ApiError, created, handleRoute, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { requireTaskAccess } from "@/lib/auth/scope";
import { uploadAttachment } from "@/lib/services/attachments";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
    return handleRoute(async () => {
        const id = (await params).id;
        await requireTaskAccess(await requireUser(), id);
        return ok(
            await db
                .select({
                    id: taskAttachments.id,
                    name: taskAttachments.name,
                    size: taskAttachments.size,
                    uploadedById: taskAttachments.uploadedById,
                    createdAt: taskAttachments.createdAt,
                })
                .from(taskAttachments)
                .where(eq(taskAttachments.taskId, id)),
        );
    });
}
export async function POST(request: Request, { params }: Context) {
    return handleRoute(async () => {
        const user = await requireUser();
        const id = (await params).id;
        await requireTaskPermission(user, id, "upload");
        if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
            throw new ApiError(413, "File too large", "FILE_SIZE");
        const file = (await request.formData()).get("file");
        if (!(file instanceof File))
            throw new ApiError(422, "File is required", "FILE_REQUIRED");
        return created(await uploadAttachment(user, id, file));
    });
}
