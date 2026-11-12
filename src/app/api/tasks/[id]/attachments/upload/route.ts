import { z } from "zod";
import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth/session";
import { requireTaskPermission } from "@/lib/auth/task-rights";
import { ApiError, created, handleRoute, ok } from "@/lib/api/http";
import { attachmentInput, createAttachmentProof, verifyAttachmentProof } from "@/lib/attachment-upload-proof";
import { recordAttachment } from "@/lib/services/attachments";
import { usesBlobStorage, removeStoredAttachment } from "@/lib/services/attachment-storage";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
    return handleRoute(async () => {
        const taskId = (await params).id;
        const user = await requireUser();
        await requireTaskPermission(user, taskId, "upload");
        const body = await request.json();
        if (body.action === "prepare") {
            const input = attachmentInput.parse(body);
            if (!usesBlobStorage()) {
                if (process.env.VERCEL)
                    throw new ApiError(503, "Persistent file storage is not configured", "STORAGE_CONFIG");
                return ok({ mode: "local" as const });
            }
            const { proof, token } = createAttachmentProof(user.id, taskId, input);
            return ok({ mode: "blob" as const, pathname: proof.pathname, token });
        }
        if (body.action === "complete") {
            const token = z.string().max(10000).parse(body.token);
            const proof = verifyAttachmentProof(token, user.id, taskId);
            const blob = await head(proof.pathname);
            if (blob.pathname !== proof.pathname || blob.size !== proof.size)
                throw new ApiError(422, "Uploaded file does not match its authorization", "FILE_SIZE");
            try {
                return created(await recordAttachment(user, taskId, {
                    id: proof.id, name: proof.name, size: proof.size,
                    storageKey: `blob:${proof.pathname}`,
                }));
            } catch (error) {
                // Only discard a proven, permanent rejection; retries after a transient DB failure remain possible.
                if (error instanceof ApiError && error.code === "STORAGE_LIMIT")
                    await removeStoredAttachment(`blob:${proof.pathname}`).catch(() => {});
                throw error;
            }
        }
        if (body.type !== "blob.generate-client-token")
            throw new ApiError(422, "Unknown upload operation", "VALIDATION_ERROR");
        const result = await handleUpload({
            body: body as HandleUploadBody,
            request,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
                const proof = verifyAttachmentProof(clientPayload ?? "", user.id, taskId);
                if (pathname !== proof.pathname)
                    throw new ApiError(403, "Upload pathname mismatch", "UPLOAD_AUTH");
                return {
                    maximumSizeInBytes: proof.size,
                    validUntil: proof.expiresAt,
                    addRandomSuffix: false,
                    allowOverwrite: false,
                };
            },
        });
        return Response.json(result);
    });
}
