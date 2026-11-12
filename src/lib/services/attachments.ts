import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { taskAttachments, taskActivity, workspaces } from "@/db/schema";
import { requireTaskAccess } from "@/lib/auth/scope";
import type { AuthUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/http";
const root = () =>
    resolve(
        /* turbopackIgnore: true */ process.env.FILE_STORAGE_PATH ??
            ".data/uploads",
    );
export async function uploadAttachment(
    user: AuthUser,
    taskId: string,
    file: File,
) {
    const task = await requireTaskAccess(user, taskId, true);
    if (file.size > 5 * 1024 * 1024 || file.size === 0)
        throw new ApiError(
            422,
            "Files must be between 1 byte and 5 MB",
            "FILE_SIZE",
        );
    const storageKey = randomUUID();
    await mkdir(root(), { recursive: true });
    const name =
        file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200) || "attachment";
    await writeFile(
        resolve(root(), storageKey),
        Buffer.from(await file.arrayBuffer()),
        { flag: "wx" },
    );
    try {
        return await db.transaction(async (tx) => {
            const [workspace] = await tx
                .select()
                .from(workspaces)
                .where(eq(workspaces.id, task.workspaceId));
            if (
                workspace.storageUsedBytes + file.size >
                workspace.storageLimitBytes
            )
                throw new ApiError(
                    409,
                    "Workspace storage limit reached",
                    "STORAGE_LIMIT",
                );
            const [attachment] = await tx
                .insert(taskAttachments)
                .values({
                    taskId,
                    uploadedById: user.id,
                    name,
                    storageKey,
                    size: file.size,
                })
                .returning();
            await tx
                .update(workspaces)
                .set({
                    storageUsedBytes: sql`${workspaces.storageUsedBytes}+${file.size}`,
                })
                .where(eq(workspaces.id, task.workspaceId));
            await tx.insert(taskActivity).values({
                taskId,
                actorId: user.id,
                action: "attachment.added",
                changes: JSON.stringify({ name, size: file.size }),
            });
            return { id: attachment.id, name, size: file.size };
        });
    } catch (error) {
        await unlink(resolve(root(), storageKey)).catch(() => {});
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
        data: await readFile(
            /* turbopackIgnore: true */ resolve(root(), row.storageKey),
        ),
    };
}
export async function deleteAttachment(user: AuthUser, id: string) {
    const [row] = await db
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.id, id));
    if (!row) throw new ApiError(404, "Attachment not found", "NOT_FOUND");
    const task = await requireTaskAccess(user, row.taskId, true);
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
    await unlink(resolve(root(), row.storageKey)).catch(() => {});
}
