import {and, count, desc, eq, gt, inArray} from "drizzle-orm";

import {db} from "@/db";
import {
    aiTaskDrafts,
    departments,
    projects,
    tasks,
    users,
    workspaceMembers,
} from "@/db/schema";
import {ApiError} from "@/lib/api/http";
import type {AiTaskDraftUpdateInput} from "@/lib/api/schemas";
import {
    generateTaskDrafts,
    MAX_GENERATED_TASKS,
    MAX_GENERATOR_PROMPT,
    type GeneratorContext,
} from "@/lib/ai/task-generator";
import {requireWorkspaceMember} from "@/lib/auth/guards";
import type {AuthUser} from "@/lib/auth/session";

const editableRoles = ["owner", "admin", "member"] as const;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_DRAFTS = 30;

const draftFields = {
    id: aiTaskDrafts.id,
    workspaceId: aiTaskDrafts.workspaceId,
    userId: aiTaskDrafts.userId,
    batchId: aiTaskDrafts.batchId,
    projectId: aiTaskDrafts.projectId,
    departmentId: aiTaskDrafts.departmentId,
    title: aiTaskDrafts.title,
    description: aiTaskDrafts.description,
    priority: aiTaskDrafts.priority,
    suggestedDeadline: aiTaskDrafts.suggestedDeadline,
    suggestedAssigneeId: aiTaskDrafts.suggestedAssigneeId,
    estimateMinutes: aiTaskDrafts.estimateMinutes,
    state: aiTaskDrafts.state,
    publishedTaskId: aiTaskDrafts.publishedTaskId,
    createdAt: aiTaskDrafts.createdAt,
    updatedAt: aiTaskDrafts.updatedAt,
    project: {
        id: projects.id,
        name: projects.name,
        color: projects.color,
    },
    department: {
        id: departments.id,
        name: departments.name,
        color: departments.color,
    },
    assignee: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
    },
};

function draftQuery() {
    return db
        .select(draftFields)
        .from(aiTaskDrafts)
        .leftJoin(projects, eq(projects.id, aiTaskDrafts.projectId))
        .leftJoin(departments, eq(departments.id, aiTaskDrafts.departmentId))
        .leftJoin(users, eq(users.id, aiTaskDrafts.suggestedAssigneeId));
}

export async function listDrafts(user: AuthUser, workspaceId: string) {
    await requireWorkspaceMember(user, workspaceId, [
        ...editableRoles,
        "viewer",
    ]);

    return draftQuery()
        .where(
            and(
                eq(aiTaskDrafts.workspaceId, workspaceId),
                eq(aiTaskDrafts.state, "draft"),
            ),
        )
        .orderBy(desc(aiTaskDrafts.createdAt))
        .limit(50);
}

async function buildContext(
    user: AuthUser,
    workspaceId: string,
    prompt: string,
): Promise<GeneratorContext> {
    const projectRows = await db
        .select({
            id: projects.id,
            name: projects.name,
            key: projects.key,
            departmentId: projects.departmentId,
        })
        .from(projects)
        .where(eq(projects.workspaceId, workspaceId))
        .limit(50);

    if (projectRows.length === 0) {
        throw new ApiError(
            422,
            "Сначала создайте проект: AI-задачам нужен проект публикации.",
            "NO_PROJECTS",
        );
    }

    const departmentIds = [...new Set(projectRows.map((p) => p.departmentId))];
    const departmentRows = await db
        .select({id: departments.id, name: departments.name})
        .from(departments)
        .where(inArray(departments.id, departmentIds))
        .limit(50);

    const memberRows = await db
        .select({
            id: users.id,
            name: users.name,
            role: users.role,
            departmentId: users.departmentId,
        })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .limit(100);

    return {
        workspaceId,
        userId: user.id,
        prompt,
        today: new Date().toISOString().slice(0, 10),
        projects: projectRows,
        departments: departmentRows,
        members: memberRows,
    };
}

export async function generateDrafts(
    user: AuthUser,
    input: {workspaceId: string; prompt: string; projectId?: string | null},
) {
    await requireWorkspaceMember(user, input.workspaceId, [...editableRoles]);

    const recent = await db
        .select({count: count()})
        .from(aiTaskDrafts)
        .where(
            and(
                eq(aiTaskDrafts.userId, user.id),
                gt(
                    aiTaskDrafts.createdAt,
                    new Date(Date.now() - RATE_WINDOW_MS),
                ),
            ),
        );

    if ((recent[0]?.count ?? 0) >= RATE_MAX_DRAFTS) {
        throw new ApiError(
            429,
            "Слишком много генераций. Подождите минуту и попробуйте снова.",
            "RATE_LIMITED",
        );
    }

    const prompt = input.prompt.trim().slice(0, MAX_GENERATOR_PROMPT);
    const context = await buildContext(user, input.workspaceId, prompt);

    if (input.projectId) {
        const project = context.projects.find((p) => p.id === input.projectId);
        if (!project) {
            throw new ApiError(
                403,
                "Проект недоступен в этом рабочем пространстве.",
                "PROJECT_FORBIDDEN",
            );
        }
        context.projects = [
            project,
            ...context.projects.filter((p) => p.id !== project.id),
        ];
    }

    const generated = await generateTaskDrafts(context);

    const rows = generated.tasks
        .slice(0, MAX_GENERATED_TASKS)
        .map((task) => ({
            workspaceId: input.workspaceId,
            userId: user.id,
            batchId: generated.batchId,
            projectId: task.projectId,
            departmentId: task.departmentId,
            title: task.title,
            description: task.description,
            priority: task.priority,
            suggestedDeadline: task.suggestedDeadline,
            suggestedAssigneeId: task.suggestedAssigneeId,
            estimateMinutes: task.estimateMinutes,
        }));

    await db.insert(aiTaskDrafts).values(rows);

    const drafts = await draftQuery()
        .where(
            and(
                eq(aiTaskDrafts.batchId, generated.batchId),
                eq(aiTaskDrafts.state, "draft"),
            ),
        )
        .orderBy(desc(aiTaskDrafts.createdAt));

    return {
        batchId: generated.batchId,
        mode: generated.mode,
        model: generated.model,
        tasks: drafts,
    };
}

async function loadDraft(user: AuthUser, draftId: string) {
    const [draft] = await db
        .select({
            id: aiTaskDrafts.id,
            workspaceId: aiTaskDrafts.workspaceId,
            userId: aiTaskDrafts.userId,
            projectId: aiTaskDrafts.projectId,
            departmentId: aiTaskDrafts.departmentId,
            state: aiTaskDrafts.state,
            publishedTaskId: aiTaskDrafts.publishedTaskId,
        })
        .from(aiTaskDrafts)
        .where(eq(aiTaskDrafts.id, draftId))
        .limit(1);

    if (!draft) {
        throw new ApiError(404, "Черновик не найден", "NOT_FOUND");
    }

    const membership = await requireWorkspaceMember(
        user,
        draft.workspaceId,
        [...editableRoles],
    );

    if (
        draft.userId !== user.id &&
        membership.role !== "owner" &&
        membership.role !== "admin"
    ) {
        throw new ApiError(
            403,
            "Редактировать может автор или администратор workspace.",
            "FORBIDDEN",
        );
    }

    return draft;
}

export async function updateDraft(
    user: AuthUser,
    draftId: string,
    input: AiTaskDraftUpdateInput,
) {
    const draft = await loadDraft(user, draftId);
    if (draft.state !== "draft") {
        throw new ApiError(
            409,
            "Опубликованный или отклонённый черновик нельзя изменить.",
            "DRAFT_LOCKED",
        );
    }

    const patch: Record<string, unknown> = {updatedAt: new Date()};

    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) {
        patch.description = input.description || null;
    }
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.estimateMinutes !== undefined) {
        patch.estimateMinutes = input.estimateMinutes;
    }

    if (input.suggestedDeadline !== undefined) {
        patch.suggestedDeadline = input.suggestedDeadline
            ? new Date(`${input.suggestedDeadline}T18:00:00`)
            : null;
    }

    if (input.suggestedAssigneeId !== undefined) {
        if (input.suggestedAssigneeId) {
            const [membership] = await db
                .select({id: workspaceMembers.id})
                .from(workspaceMembers)
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, draft.workspaceId),
                        eq(
                            workspaceMembers.userId,
                            input.suggestedAssigneeId,
                        ),
                    ),
                )
                .limit(1);
            if (!membership) {
                throw new ApiError(
                    403,
                    "Исполнитель не является участником workspace.",
                    "ASSIGNEE_FORBIDDEN",
                );
            }
        }
        patch.suggestedAssigneeId = input.suggestedAssigneeId || null;
    }

    if (input.projectId !== undefined) {
        if (!input.projectId) {
            throw new ApiError(422, "Проект обязателен", "PROJECT_REQUIRED");
        }
        const [project] = await db
            .select({id: projects.id, departmentId: projects.departmentId})
            .from(projects)
            .where(
                and(
                    eq(projects.id, input.projectId),
                    eq(projects.workspaceId, draft.workspaceId),
                ),
            )
            .limit(1);
        if (!project) {
            throw new ApiError(
                403,
                "Проект недоступен в этом workspace.",
                "PROJECT_FORBIDDEN",
            );
        }
        patch.projectId = project.id;
        patch.departmentId = project.departmentId;
    }

    if (input.departmentId !== undefined) {
        if (!input.departmentId) {
            throw new ApiError(422, "Отдел обязателен", "DEPARTMENT_REQUIRED");
        }
        const [department] = await db
            .select({id: departments.id})
            .from(departments)
            .where(eq(departments.id, input.departmentId))
            .limit(1);
        if (!department) {
            throw new ApiError(404, "Отдел не найден", "NOT_FOUND");
        }
        patch.departmentId = department.id;
    }

    await db
        .update(aiTaskDrafts)
        .set(patch)
        .where(eq(aiTaskDrafts.id, draftId));

    const [updated] = await draftQuery()
        .where(eq(aiTaskDrafts.id, draftId))
        .limit(1);

    return updated;
}

export async function rejectDraft(user: AuthUser, draftId: string) {
    const draft = await loadDraft(user, draftId);
    if (draft.state === "published") {
        throw new ApiError(
            409,
            "Опубликованную задачу нельзя отклонить.",
            "DRAFT_PUBLISHED",
        );
    }

    await db
        .update(aiTaskDrafts)
        .set({state: "rejected", updatedAt: new Date()})
        .where(eq(aiTaskDrafts.id, draftId));
}

export async function publishDrafts(
    user: AuthUser,
    workspaceId: string,
    draftIds: string[],
) {
    await requireWorkspaceMember(user, workspaceId, [...editableRoles]);

    const uniqueIds = [...new Set(draftIds)].slice(0, 50);
    if (uniqueIds.length === 0) return [];

    const result = await db.transaction(async (tx) => {
        const drafts = await tx
            .select()
            .from(aiTaskDrafts)
            .where(
                and(
                    eq(aiTaskDrafts.workspaceId, workspaceId),
                    inArray(aiTaskDrafts.id, uniqueIds),
                    inArray(aiTaskDrafts.state, ["draft", "published"]),
                ),
            );

        const projectRows = await tx
            .select({
                id: projects.id,
                departmentId: projects.departmentId,
            })
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId));

        const memberRows = await tx
            .select({userId: workspaceMembers.userId})
            .from(workspaceMembers)
            .where(eq(workspaceMembers.workspaceId, workspaceId));

        const allowedProjects = new Map(
            projectRows.map((project) => [project.id, project]),
        );
        const allowedMembers = new Set(memberRows.map((row) => row.userId));
        const fallbackProject = projectRows[0];

        if (!fallbackProject) {
            throw new ApiError(
                422,
                "В workspace нет проекта для публикации.",
                "NO_PROJECT",
            );
        }

        const published: Array<{draftId: string; taskId: string}> = [];

        for (const draft of drafts) {
            if (draft.publishedTaskId) {
                published.push({
                    draftId: draft.id,
                    taskId: draft.publishedTaskId,
                });
                continue;
            }

            const project =
                (draft.projectId
                    ? allowedProjects.get(draft.projectId)
                    : undefined) ?? fallbackProject;

            const [task] = await tx
                .insert(tasks)
                .values({
                    workspaceId,
                    projectId: project.id,
                    departmentId: draft.departmentId ?? project.departmentId,
                    title: draft.title,
                    description: draft.description,
                    status: "todo",
                    priority: draft.priority,
                    assigneeId:
                        draft.suggestedAssigneeId &&
                        allowedMembers.has(draft.suggestedAssigneeId)
                            ? draft.suggestedAssigneeId
                            : null,
                    dueDate: draft.suggestedDeadline,
                    estimateMinutes: draft.estimateMinutes,
                    creatorId: user.id,
                })
                .returning({id: tasks.id});

            await tx
                .update(aiTaskDrafts)
                .set({
                    state: "published",
                    publishedTaskId: task.id,
                    updatedAt: new Date(),
                })
                .where(eq(aiTaskDrafts.id, draft.id));

            published.push({draftId: draft.id, taskId: task.id});
        }

        return published;
    });

    return result;
}
