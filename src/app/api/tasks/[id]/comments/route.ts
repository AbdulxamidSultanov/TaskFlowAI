import {asc, eq} from "drizzle-orm";

import {db} from "@/db";
import {comments, users} from "@/db/schema";
import {
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {commentCreateSchema} from "@/lib/api/schemas";
import {requireUser} from "@/lib/auth/session";
import {addComment, requireTaskWorkspace} from "@/lib/services/task-service";

type Params = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await requireTaskWorkspace(user, id);

        const items = await db
            .select({
                id: comments.id,
                body: comments.body,
                createdAt: comments.createdAt,
                updatedAt: comments.updatedAt,
                author: {
                    id: users.id,
                    name: users.name,
                    avatarUrl: users.avatarUrl,
                },
            })
            .from(comments)
            .innerJoin(users, eq(users.id, comments.authorId))
            .where(eq(comments.taskId, id))
            .orderBy(asc(comments.createdAt));

        return ok(items);
    });
}

export async function POST(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const input = await parseBody(request, commentCreateSchema);
        const comment = await addComment(user, id, input.body);
        return created(comment);
    });
}
