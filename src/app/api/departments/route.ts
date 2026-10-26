import {asc, count} from "drizzle-orm";

import {db} from "@/db";
import {departments, projects, tasks, users} from "@/db/schema";
import {
    created,
    handleRoute,
    ok,
    parseBody,
} from "@/lib/api/http";
import {departmentCreateSchema} from "@/lib/api/schemas";
import {requireUser, requireRole} from "@/lib/auth/session";

export async function GET() {
    return handleRoute(async () => {
        await requireUser();

        const items = await db
            .select()
            .from(departments)
            .orderBy(asc(departments.name));

        const [userCounts, projectCounts, taskCounts] = await Promise.all([
            db
                .select({departmentId: users.departmentId, value: count()})
                .from(users)
                .groupBy(users.departmentId),
            db
                .select({departmentId: projects.departmentId, value: count()})
                .from(projects)
                .groupBy(projects.departmentId),
            db
                .select({departmentId: tasks.departmentId, value: count()})
                .from(tasks)
                .groupBy(tasks.departmentId),
        ]);

        const map = (rows: Array<{departmentId: string | null; value: number}>) =>
            new Map(rows.map((row) => [row.departmentId, row.value]));

        const userMap = map(userCounts);
        const projectMap = map(projectCounts);
        const taskMap = map(taskCounts);

        return ok(
            items.map((department) => ({
                ...department,
                counts: {
                    users: userMap.get(department.id) ?? 0,
                    projects: projectMap.get(department.id) ?? 0,
                    tasks: taskMap.get(department.id) ?? 0,
                },
            })),
        );
    });
}

export async function POST(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        requireRole(user, ["admin", "manager"]);

        const input = await parseBody(request, departmentCreateSchema);

        const [department] = await db
            .insert(departments)
            .values({
                name: input.name,
                slug: input.slug,
                description: input.description ?? null,
                color: input.color ?? "#4F46E5",
            })
            .returning();

        return created(department);
    });
}
