import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import {taskUpdateSchema} from "@/lib/api/schemas";
import {requireUser} from "@/lib/auth/session";
import {
    deleteTask,
    getTaskDetail,
    requireTaskWorkspace,
    updateTask,
} from "@/lib/services/task-service";

type Params = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await requireTaskWorkspace(user, id);
        const task = await getTaskDetail(id);

        if (!task) {
            throw new ApiError(404, "Task not found", "NOT_FOUND");
        }

        return ok(task);
    });
}

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const input = await parseBody(request, taskUpdateSchema);
        const task = await updateTask(user, id, input);
        return ok(task);
    });
}

export async function DELETE(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        await deleteTask(user, id);
        return noContent();
    });
}
