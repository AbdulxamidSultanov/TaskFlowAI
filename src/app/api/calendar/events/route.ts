import {and, asc, eq, gte, inArray, lte} from "drizzle-orm";

import {db} from "@/db";
import {calendarEvents, departments, projects, tasks} from "@/db/schema";
import {
    ApiError,
    created,
    handleRoute,
    ok,
    parseBody,
    parseQuery,
} from "@/lib/api/http";
import {
    calendarEventCreateSchema,
    calendarListQuerySchema,
} from "@/lib/api/schemas";
import {getAccessibleWorkspaceIds, requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const query = await parseQuery(url, calendarListQuerySchema);
        const workspaceIds = await getAccessibleWorkspaceIds(user);

        if (query.workspaceId && !workspaceIds.includes(query.workspaceId)) {
            throw new ApiError(403, "Workspace access denied", "FORBIDDEN");
        }

        const conditions = [];
        if (query.workspaceId) {
            conditions.push(eq(calendarEvents.workspaceId, query.workspaceId));
        } else {
            conditions.push(inArray(calendarEvents.workspaceId, workspaceIds));
        }
        if (query.departmentId) {
            conditions.push(eq(calendarEvents.departmentId, query.departmentId));
        }
        if (query.projectId) {
            conditions.push(eq(calendarEvents.projectId, query.projectId));
        }
        if (query.from) {
            conditions.push(gte(calendarEvents.endAt, new Date(query.from)));
        }
        if (query.to) {
            conditions.push(lte(calendarEvents.startAt, new Date(query.to)));
        }
        const where = conditions.length ? and(...conditions) : undefined;

        const items = await db
            .select({
                id: calendarEvents.id,
                workspaceId: calendarEvents.workspaceId,
                departmentId: calendarEvents.departmentId,
                projectId: calendarEvents.projectId,
                taskId: calendarEvents.taskId,
                title: calendarEvents.title,
                description: calendarEvents.description,
                startAt: calendarEvents.startAt,
                endAt: calendarEvents.endAt,
                allDay: calendarEvents.allDay,
                location: calendarEvents.location,
                createdById: calendarEvents.createdById,
                createdAt: calendarEvents.createdAt,
                updatedAt: calendarEvents.updatedAt,
                department: {
                    id: departments.id,
                    name: departments.name,
                    color: departments.color,
                },
                project: {
                    id: projects.id,
                    name: projects.name,
                    key: projects.key,
                },
                task: {
                    id: tasks.id,
                    title: tasks.title,
                    status: tasks.status,
                },
            })
            .from(calendarEvents)
            .leftJoin(departments, eq(departments.id, calendarEvents.departmentId))
            .leftJoin(projects, eq(projects.id, calendarEvents.projectId))
            .leftJoin(tasks, eq(tasks.id, calendarEvents.taskId))
            .where(where)
            .orderBy(asc(calendarEvents.startAt));

        return ok(items);
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const input = await parseBody(request, calendarEventCreateSchema);
        await requireWorkspaceMember(user, input.workspaceId);

        const [event] = await db
            .insert(calendarEvents)
            .values({
                workspaceId: input.workspaceId,
                departmentId: input.departmentId ?? null,
                projectId: input.projectId ?? null,
                taskId: input.taskId ?? null,
                title: input.title,
                description: input.description ?? null,
                startAt: new Date(input.startAt),
                endAt: new Date(input.endAt),
                allDay: input.allDay ?? false,
                location: input.location ?? null,
                createdById: user.id,
            })
            .returning();

        return created(event);
    });
}
