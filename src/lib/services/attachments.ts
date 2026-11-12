import { requireTaskPermission } from "@/lib/auth/task-rights";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { taskAttachments, taskActivity, workspaces } from "@/db/schema";
import { requireTaskAccess } from "@/lib/auth/scope";
import type { AuthUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/http";
import { storeAttachment, readAttachment, removeStoredAttachment } from "./attachment-storage";

export async function recordAttachment(
    user: AuthUser,
    taskId: string,
    file: { id: string; name: string; size: number; storageKey: string },
) {
    const { task } = await requireTaskPermission(user, taskId, "upload");
    return db.transaction(async (tx) => {
        const [existing] = await tx.select().from(taskAttachments).where(eq(taskAttachments.id, file.id));
        if (existing) {
            if (existing.taskId !== taskId || existing.uploadedById !== user.id || existing.storageKey !== file.storageKey)
                throw new ApiError(409, "Upload already registered", "CONFLICT");
            return { id: existing.id, name: existing.name, size: existing.size };
        }
        const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, task.workspaceId));
        if (workspace.storageUsedBytes + file.size > workspace.storageLimitBytes)
            throw new ApiError(409, "Workspace storage limit reached", "STORAGE_LIMIT");
        const [attachment] = await tx.insert(taskAttachments).values({
            ...file, taskId, uploadedById: user.id,
        }).returning();
        await tx.update(workspaces).set({
            storageUsedBytes: sql`${workspaces.storageUsedBytes}+${file.size}`,
        }).where(eq(workspaces.id, task.workspaceId));
        await tx.insert(taskActivity).values({
            taskId, actorId: user.id, action: "attachment.added",
            changes: JSON.stringify({ name: file.name, size: file.size }),
        });
        return { id: attachment.id, name: attachment.name, size: attachment.size };
    });
}
export async function uploadAttachment(
    user: AuthUser,
    taskId: string,
    file: File,
) {
    await requireTaskPermission(user, taskId, "upload");
    if (file.size > 5 * 1024 * 1024 || file.size === 0)
        throw new ApiError(422, "Files must be between 1 byte and 5 MB", "FILE_SIZE");
    const id = randomUUID();
    const storageKey = await storeAttachment(id, file);
    const name = file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200) || "attachment";
    try {
        return await recordAttachment(user, taskId, { id, name, size: file.size, storageKey });
    } catch (error) {
        await removeStoredAttachment(storageKey).catch(() => {});
        throw error;
    }
}

export async function downloadAttachment(user: AuthUser, id: string) {
    const [row] = await db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.id, id));
    if (!row) throw new ApiError(404, "Attachment not found", "NOT_FOUND");
    await requireTaskAccess(user, row.taskId);
    return {
        row,
        data: await readAttachment(row.storageKey),
    };
}
export async function deleteAttachment(user: AuthUser, id: string) {
    const [row] = await db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.id, id));
    if (!row) throw new ApiError(404, "Attachment not found", "NOT_FOUND");
    const { task, permissions } = await requireTaskPermission(
        user,
        row.taskId,
        "upload",
    );
    if (row.uploadedById !== user.id && !permissions.delete)
        throw new ApiError(
            403,
            "Only the author or task manager can delete this file",
            "FORBIDDEN",
        );
    await db.transaction(async (tx) => {
        const deleted = await tx
            .delete(taskAttachments)
            .where(eq(taskAttachments.id, id))
            .returning();
        if (!deleted.length) return;
        await tx
            .update(workspaces)
            .set({
                storageUsedBytes: sql`max(0,${workspaces.storageUsedBytes}-${row.size})`,
            })
            .where(eq(workspaces.id, task.workspaceId));
        await tx.insert(taskActivity).values({
            taskId: task.id,
            actorId: user.id,
            action: "attachment.deleted",
            changes: JSON.stringify({ name: row.name }),
        });
    });
    await removeStoredAttachment(row.storageKey);
}
