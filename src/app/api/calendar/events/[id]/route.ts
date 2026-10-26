import {eq} from "drizzle-orm";

import {db} from "@/db";
import {calendarEvents} from "@/db/schema";
import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import {calendarEventUpdateSchema} from "@/lib/api/schemas";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

type Params = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const [event] = await db
            .select()
            .from(calendarEvents)
            .where(eq(calendarEvents.id, id))
            .limit(1);

        if (!event) {
            throw new ApiError(404, "Calendar event not found", "NOT_FOUND");
        }

        await requireWorkspaceMember(user, event.workspaceId, [
            "owner",
            "admin",
            "member",
            "viewer",
        ]);

        return ok(event);
    });
}

export async function PATCH(request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const [event] = await db
            .select()
            .from(calendarEvents)
            .where(eq(calendarEvents.id, id))
            .limit(1);

        if (!event) {
            throw new ApiError(404, "Calendar event not found", "NOT_FOUND");
        }

        await requireWorkspaceMember(user, event.workspaceId);
        const input = await parseBody(request, calendarEventUpdateSchema);

        const startAt = input.startAt ? new Date(input.startAt) : event.startAt;
        const endAt = input.endAt ? new Date(input.endAt) : event.endAt;
        if (endAt <= startAt) {
            throw new ApiError(
                422,
                "endAt must be after startAt",
                "INVALID_TIME_RANGE",
            );
        }

        const [updated] = await db
            .update(calendarEvents)
            .set({
                ...(input.departmentId === undefined
                    ? {}
                    : {departmentId: input.departmentId}),
                ...(input.projectId === undefined
                    ? {}
                    : {projectId: input.projectId}),
                ...(input.taskId === undefined ? {} : {taskId: input.taskId}),
                ...(input.title === undefined ? {} : {title: input.title}),
                ...(input.description === undefined
                    ? {}
                    : {description: input.description}),
                startAt,
                endAt,
                ...(input.allDay === undefined ? {} : {allDay: input.allDay}),
                ...(input.location === undefined
                    ? {}
                    : {location: input.location}),
                updatedAt: new Date(),
            })
            .where(eq(calendarEvents.id, id))
            .returning();

        return ok(updated);
    });
}

export async function DELETE(_request: Request, {params}: Params) {
    return handleRoute(async () => {
        const user = await requireUser();
        const {id} = await params;
        const [event] = await db
            .select({workspaceId: calendarEvents.workspaceId})
            .from(calendarEvents)
            .where(eq(calendarEvents.id, id))
            .limit(1);

        if (!event) {
            throw new ApiError(404, "Calendar event not found", "NOT_FOUND");
        }

        await requireWorkspaceMember(user, event.workspaceId);
        await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
        return noContent();
    });
}
