import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api/http";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const attachmentInput = z.object({
    name: z.string().min(1).max(1000),
    size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});
const proofSchema = attachmentInput.extend({
    id: z.uuid(),
    userId: z.string().min(1),
    taskId: z.string().min(1),
    pathname: z.string().min(1),
    expiresAt: z.number(),
});
export type AttachmentProof = z.infer<typeof proofSchema>;
const signature = (value: string) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32)
        throw new ApiError(503, "Upload signing is not configured", "STORAGE_CONFIG");
    return createHmac("sha256", secret).update(`attachment:${value}`).digest("base64url");
};
export function createAttachmentProof(userId: string, taskId: string, input: z.infer<typeof attachmentInput>) {
    const data = attachmentInput.parse(input);
    const id = randomUUID();
    const proof: AttachmentProof = {
        ...data, id, userId, taskId, pathname: `taskflow/${id}`,
        name: data.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200) || "attachment",
        expiresAt: Date.now() + 15 * 60 * 1000,
    };
    const value = Buffer.from(JSON.stringify(proof)).toString("base64url");
    return { proof, token: `${value}.${signature(value)}` };
}
export function verifyAttachmentProof(token: string, userId: string, taskId: string) {
    const [value, mac, extra] = token.split(".");
    const expected = Buffer.from(signature(value ?? ""));
    const actual = Buffer.from(mac ?? "");
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new ApiError(403, "Invalid upload authorization", "UPLOAD_AUTH");
    const parsed = proofSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString()));
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.taskId !== taskId || parsed.data.expiresAt <= Date.now())
        throw new ApiError(403, "Upload authorization expired or belongs to another task", "UPLOAD_AUTH");
    return parsed.data;
}
