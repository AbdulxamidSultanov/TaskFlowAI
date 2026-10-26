import {handleRoute, created, ok, parseBody, parseQuery} from "@/lib/api/http";
import {getPagination} from "@/lib/api/pagination";
import {taskCreateSchema, taskListQuerySchema} from "@/lib/api/schemas";
import {requireUser} from "@/lib/auth/session";
import {createTask, listTasks} from "@/lib/services/task-service";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const query = await parseQuery(url, taskListQuerySchema);
        const pagination = getPagination(url);

        const result = await listTasks(user, query, pagination);
        return ok(result);
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, taskCreateSchema);
        const task = await createTask(user, input);
        return created(task);
    });
}
