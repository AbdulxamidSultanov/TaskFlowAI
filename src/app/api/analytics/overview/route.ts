import {
    and,
    asc,
    count,
    desc,
    eq,
    gte,
    inArray,
    lt,
    lte,
    ne,
    sql,
} from "drizzle-orm";

import {db} from "@/db";
import {departments, tasks} from "@/db/schema";
import {ApiError, handleRoute, ok, parseQuery} from "@/lib/api/http";
import {analyticsQuerySchema} from "@/lib/api/schemas";
import {getAccessibleWorkspaceIds} from "@/lib/auth/guards";
import {requireUser} from "@/lib/auth/session";

export async function GET(request: Request) {
    return handleRoute(async () => {
        const user = await requireUser();
        const url = new URL(request.url);
        const query = await parseQuery(url, analyticsQuerySchema);
        const workspaceIds = await getAccessibleWorkspaceIds(user);

        if (query.workspaceId && !workspaceIds.includes(query.workspaceId)) {
            throw new ApiError(403, "Workspace access denied", "FORBIDDEN");
        }

        const baseConditions = [];
        if (query.workspaceId) {
            baseConditions.push(eq(tasks.workspaceId, query.workspaceId));
        } else {
            baseConditions.push(inArray(tasks.workspaceId, workspaceIds));
        }
        if (query.departmentId) {
            baseConditions.push(eq(tasks.departmentId, query.departmentId));
        }
        if (query.from) {
            baseConditions.push(gte(tasks.createdAt, new Date(query.from)));
        }
        if (query.to) {
            baseConditions.push(lte(tasks.createdAt, new Date(query.to)));
        }

        const taskWhere = baseConditions.length
            ? and(...baseConditions)
            : undefined;

        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const [
            totalRows,
            completedRows,
            overdueRows,
            byStatus,
            byPriority,
            byDepartment,
            upcoming,
            recentlyCompleted,
        ] = await Promise.all([
            db.select({value: count()}).from(tasks).where(taskWhere),
            db
                .select({value: count()})
                .from(tasks)
                .where(
                    taskWhere
                        ? and(taskWhere, eq(tasks.status, "completed"))
                        : eq(tasks.status, "completed"),
                ),
            db
                .select({value: count()})
                .from(tasks)
                .where(
                    taskWhere
                        ? and(
                              taskWhere,
                              lt(tasks.dueDate, now),
                              ne(tasks.status, "completed"),
                          )
                        : and(
                              lt(tasks.dueDate, now),
                              ne(tasks.status, "completed"),
                          ),
                ),
            db
                .select({status: tasks.status, value: count()})
                .from(tasks)
                .where(taskWhere)
                .groupBy(tasks.status),
            db
                .select({priority: tasks.priority, value: count()})
                .from(tasks)
                .where(taskWhere)
                .groupBy(tasks.priority),
            db
                .select({
                    departmentId: departments.id,
                    name: departments.name,
                    color: departments.color,
                    total: count(tasks.id),
                    completed: sql<number>`sum(case when ${tasks.status} = 'completed' then 1 else 0 end)`,
                })
                .from(departments)
                .leftJoin(
                    tasks,
                    and(
                        eq(tasks.departmentId, departments.id),
                        ...baseConditions,
                    ),
                )
                .where(
                    query.departmentId
                        ? eq(departments.id, query.departmentId)
                        : undefined,
                )
                .groupBy(departments.id)
                .orderBy(asc(departments.name)),
            db
                .select({
                    id: tasks.id,
                    title: tasks.title,
                    status: tasks.status,
                    priority: tasks.priority,
                    dueDate: tasks.dueDate,
                    assigneeId: tasks.assigneeId,
                    projectId: tasks.projectId,
                })
                .from(tasks)
                .where(
                    taskWhere
                        ? and(
                              taskWhere,
                              gte(tasks.dueDate, now),
                              ne(tasks.status, "completed"),
                          )
                        : and(
                              gte(tasks.dueDate, now),
                              ne(tasks.status, "completed"),
                          ),
                )
                .orderBy(asc(tasks.dueDate))
                .limit(8),
            db
                .select({
                    id: tasks.id,
                    title: tasks.title,
                    completedAt: tasks.completedAt,
                    assigneeId: tasks.assigneeId,
                })
                .from(tasks)
                .where(
                    taskWhere
                        ? and(
                              taskWhere,
                              eq(tasks.status, "completed"),
                              gte(tasks.completedAt, weekAgo),
                              lte(tasks.completedAt, now),
                          )
                        : and(
                              eq(tasks.status, "completed"),
                              gte(tasks.completedAt, weekAgo),
                              lte(tasks.completedAt, now),
                          ),
                )
                .orderBy(desc(tasks.completedAt))
                .limit(10),
        ]);

        const total = totalRows[0]?.value ?? 0;
        const completed = completedRows[0]?.value ?? 0;

        return ok({
            totals: {
                tasks: total,
                completed,
                open: total - completed,
                overdue: overdueRows[0]?.value ?? 0,
                completionRate:
                    total === 0 ? 0 : Math.round((completed / total) * 1000) / 10,
            },
            byStatus: byStatus.map((row) => ({
                status: row.status,
                count: row.value,
            })),
            byPriority: byPriority.map((row) => ({
                priority: row.priority,
                count: row.value,
            })),
            byDepartment: byDepartment.map((row) => ({
                ...row,
                completed: Number(row.completed ?? 0),
            })),
            upcoming,
            recentlyCompleted,
        });
    });
}
