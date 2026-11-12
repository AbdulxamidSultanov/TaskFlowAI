import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { del, get, put } from "@vercel/blob";
import { ApiError } from "@/lib/api/http";

export const usesBlobStorage = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const root = () => resolve(/* turbopackIgnore: true */ process.env.FILE_STORAGE_PATH ?? ".data/uploads");
export async function storeAttachment(key: string, file: File) {
    if (usesBlobStorage()) {
        const result = await put(`taskflow/${key}`, file, {
            access: "private", addRandomSuffix: false, allowOverwrite: false,
            contentType: "application/octet-stream",
        });
        return `blob:${result.pathname}`;
    }
    if (process.env.VERCEL)
        throw new ApiError(503, "Persistent file storage is not configured", "STORAGE_CONFIG");
    await mkdir(root(), { recursive: true });
    await writeFile(resolve(root(), key), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    return key;
}
export async function readAttachment(key: string) {
    if (!key.startsWith("blob:"))
        return readFile(/* turbopackIgnore: true */ resolve(root(), key));
    const result = await get(key.slice(5), { access: "private" });
    if (!result || result.statusCode !== 200)
        throw new ApiError(404, "Attachment not found", "NOT_FOUND");
    return result.stream;
}
export async function removeStoredAttachment(key: string) {
    if (key.startsWith("blob:")) return del(key.slice(5));
    await unlink(resolve(root(), key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
    });
}
