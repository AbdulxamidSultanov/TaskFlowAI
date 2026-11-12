import { handleRoute, noContent } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import {
    downloadAttachment,
    deleteAttachment,
} from "@/lib/services/attachments";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
    return handleRoute(async () => {
        const { row, data } = await downloadAttachment(
            await requireUser(),
            (await params).id,
        );
        return new Response(new Uint8Array(data), {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store",
            },
        });
    });
}
export async function DELETE(_request: Request, { params }: Context) {
    return handleRoute(async () => {
        await deleteAttachment(await requireUser(), (await params).id);
        return noContent();
    });
}
