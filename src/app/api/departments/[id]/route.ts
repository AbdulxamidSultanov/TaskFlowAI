import {
    departmentScope,
    visibleUserIds,
    taskScope,
    projectScope,
} from "@/lib/auth/scope";
import { requireWorkspaceMember } from "@/lib/auth/guards";
import { and, count, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { departments, projects, tasks, users } from "@/db/schema";
import {
    ApiError,
    handleRoute,
    noContent,
    ok,
    parseBody,
} from "@/lib/api/http";
import { departmentUpdateSchema } from "@/lib/api/schemas";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const actor = await requireUser();
        const { id } = await params;

        const [department] = await db
            .select()
            .from(departments)
            .where(and(eq(departments.id, id), await departmentScope(actor)))
            .limit(1);

        if (!department) {
            throw new ApiError(404, "Department not found", "NOT_FOUND");
        }

        const [userCount, projectCount, taskCount, members] = await Promise.all(
            [
                db
                    .select({ value: count() })
                    .from(users)
                    .where(
                        and(
                            eq(users.departmentId, id),
                            inArray(users.id, await visibleUserIds(actor)),
                        ),
                    ),
                db
                    .select({ value: count() })
                    .from(projects)
                    .where(
                        and(
                            eq(projects.departmentId, id),
                            await projectScope(actor),
                        ),
                    ),
                db
                    .select({ value: count() })
                    .from(tasks)
                    .where(
                        and(eq(tasks.departmentId, id), await taskScope(actor)),
                    ),
                db
                    .select({
                        id: users.id,
                        name: users.name,
                        email: users.email,
                        role: users.role,
                        jobTitle: users.jobTitle,
                        avatarUrl: users.avatarUrl,
                        isActive: users.isActive,
                    })
                    .from(users)
                    .where(
                        and(
                            eq(users.departmentId, id),
                            inArray(users.id, await visibleUserIds(actor)),
                        ),
                    ),
            ],
        );

        return ok({
            ...department,
            counts: {
                users: userCount[0]?.value ?? 0,
                projects: projectCount[0]?.value ?? 0,
                tasks: taskCount[0]?.value ?? 0,
            },
            members,
        });
    });
}

export async function PATCH(request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();

        const { id } = await params;
        await assertDepartmentAdmin(user, id);
        const input = await parseBody(request, departmentUpdateSchema);

        const [existing] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, id))
            .limit(1);

        if (!existing) {
            throw new ApiError(404, "Department not found", "NOT_FOUND");
        }

        const [updated] = await db
            .update(departments)
            .set({
                ...(input.name === undefined ? {} : { name: input.name }),
                ...(input.slug === undefined ? {} : { slug: input.slug }),
                ...(input.description === undefined
                    ? {}
                    : { description: input.description }),
                ...(input.color === undefined ? {} : { color: input.color }),
                updatedAt: new Date(),
            })
            .where(eq(departments.id, id))
            .returning();

        return ok(updated);
    });
}

export async function DELETE(_request: Request, { params }: Params) {
    return handleRoute(async () => {
        const user = await requireUser();

        const { id } = await params;
        await assertDepartmentAdmin(user, id);

        const [department] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, id))
            .limit(1);

        if (!department) {
            throw new ApiError(404, "Department not found", "NOT_FOUND");
        }

        const [busy] = await db
            .select({ value: count() })
            .from(users)
            .where(and(eq(users.departmentId, id), ne(users.id, user.id)));

        if ((busy?.value ?? 0) > 0) {
            throw new ApiError(
                409,
                "Move or remove department members before deleting it",
                "DEPARTMENT_NOT_EMPTY",
            );
        }

        await db.delete(departments).where(eq(departments.id, id));
        return noContent();
    });
}

async function assertDepartmentAdmin(
    user: Awaited<ReturnType<typeof requireUser>>,
    id: string,
) {
    const [department] = await db
        .select()
        .from(departments)
        .where(eq(departments.id, id));
    if (!department?.workspaceId)
        throw new ApiError(404, "Department not found", "NOT_FOUND");
    await requireWorkspaceMember(user, department.workspaceId, [
        "owner",
        "admin",
    ]);
}
