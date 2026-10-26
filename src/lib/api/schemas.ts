import {z} from "zod";

import {
    localeValues,
    notificationTypes,
    projectStatuses,
    taskPriorities,
    taskStatuses,
    themeValues,
    userRoles,
    workspacePlans,
    workspaceRoles,
} from "@/lib/domain";

const email = z.string().email().toLowerCase();
const isoDate = z.string().datetime({offset: true});
const nullableIsoDate = isoDate.nullable().optional();
const id = z.string().min(1);

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email,
    password: z.string().min(8).max(72),
    departmentId: id.nullable().optional(),
});

export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(72),
});

export const departmentCreateSchema = z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
    description: z.string().max(500).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const departmentUpdateSchema = departmentCreateSchema.partial();

export const userCreateSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email,
    password: z.string().min(8).max(72),
    role: z.enum(userRoles).optional(),
    departmentId: id.nullable().optional(),
    jobTitle: z.string().max(120).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    timezone: z.string().max(80).optional(),
});

export const userUpdateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: email.optional(),
    password: z.string().min(8).max(72).optional(),
    role: z.enum(userRoles).optional(),
    departmentId: id.nullable().optional(),
    jobTitle: z.string().max(120).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    timezone: z.string().max(80).optional(),
    isActive: z.boolean().optional(),
});

export const workspaceCreateSchema = z.object({
    name: z.string().trim().min(2).max(100),
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
    plan: z.enum(workspacePlans).optional(),
});

export const workspaceUpdateSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    plan: z.enum(workspacePlans).optional(),
    storageUsedBytes: z.number().int().min(0).optional(),
    storageLimitBytes: z.number().int().min(0).optional(),
});

export const workspaceMemberAddSchema = z.object({
    userId: id,
    role: z.enum(workspaceRoles).optional(),
});

export const workspaceMemberUpdateSchema = z.object({
    role: z.enum(workspaceRoles),
});

export const projectCreateSchema = z.object({
    workspaceId: id,
    departmentId: id,
    name: z.string().trim().min(2).max(140),
    key: z.string().trim().min(2).max(12).regex(/^[A-Z0-9-]+$/),
    description: z.string().max(2000).nullable().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    status: z.enum(projectStatuses).optional(),
    ownerId: id.optional(),
    startDate: nullableIsoDate,
    dueDate: nullableIsoDate,
});

export const projectUpdateSchema = projectCreateSchema
    .omit({workspaceId: true})
    .partial();

export const taskCreateSchema = z.object({
    workspaceId: id.optional(),
    projectId: id,
    departmentId: id.optional(),
    parentTaskId: id.nullable().optional(),
    title: z.string().trim().min(2).max(240),
    description: z.string().max(8000).nullable().optional(),
    status: z.enum(taskStatuses).optional(),
    priority: z.enum(taskPriorities).optional(),
    assigneeId: id.nullable().optional(),
    startDate: nullableIsoDate,
    dueDate: nullableIsoDate,
    estimateMinutes: z.number().int().min(0).max(100000).nullable().optional(),
    position: z.number().int().min(0).optional(),
    tagIds: z.array(id).max(30).optional(),
});

export const taskUpdateSchema = taskCreateSchema
    .omit({workspaceId: true, projectId: true})
    .extend({
        projectId: id.optional(),
    })
    .partial();

export const taskListQuerySchema = z.object({
    workspaceId: id.optional(),
    projectId: id.optional(),
    departmentId: id.optional(),
    assigneeId: id.optional(),
    parentTaskId: id.optional(),
    status: z.enum(taskStatuses).optional(),
    priority: z.enum(taskPriorities).optional(),
    search: z.string().trim().max(120).optional(),
    due: z.enum(["overdue", "today", "week"]).optional(),
    dueFrom: isoDate.optional(),
    dueTo: isoDate.optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const projectListQuerySchema = z.object({
    workspaceId: id.optional(),
    departmentId: id.optional(),
    status: z.enum(projectStatuses).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const userListQuerySchema = z.object({
    departmentId: id.optional(),
    role: z.enum(userRoles).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const commentCreateSchema = z.object({
    body: z.string().trim().min(1).max(5000),
});

export const tagCreateSchema = z.object({
    workspaceId: id,
    name: z.string().trim().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const calendarEventCreateSchema = z
    .object({
        workspaceId: id,
        departmentId: id.nullable().optional(),
        projectId: id.nullable().optional(),
        taskId: id.nullable().optional(),
        title: z.string().trim().min(2).max(240),
        description: z.string().max(5000).nullable().optional(),
        startAt: isoDate,
        endAt: isoDate,
        allDay: z.boolean().optional(),
        location: z.string().max(240).nullable().optional(),
    })
    .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
        message: "endAt must be after startAt",
        path: ["endAt"],
    });

export const calendarEventUpdateSchema = z.object({
    departmentId: id.nullable().optional(),
    projectId: id.nullable().optional(),
    taskId: id.nullable().optional(),
    title: z.string().trim().min(2).max(240).optional(),
    description: z.string().max(5000).nullable().optional(),
    startAt: isoDate.optional(),
    endAt: isoDate.optional(),
    allDay: z.boolean().optional(),
    location: z.string().max(240).nullable().optional(),
});

export const calendarListQuerySchema = z.object({
    workspaceId: id.optional(),
    departmentId: id.optional(),
    projectId: id.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
});

export const notificationListQuerySchema = z.object({
    unread: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const notificationCreateSchema = z.object({
    userId: id,
    type: z.enum(notificationTypes).optional(),
    title: z.string().trim().min(1).max(160),
    body: z.string().max(1000).nullable().optional(),
    entityType: z.string().max(40).nullable().optional(),
    entityId: id.nullable().optional(),
});

export const aiConversationCreateSchema = z.object({
    workspaceId: id,
    title: z.string().trim().min(1).max(160).optional(),
    model: z.string().trim().max(80).optional(),
});

export const aiMessageCreateSchema = z.object({
    content: z.string().trim().min(1).max(12000),
});

export const aiPlanRequestSchema = z.object({
    workspaceId: id,
    date: isoDate.optional(),
    availableMinutes: z.number().int().min(60).max(1440).optional(),
});

export const settingsUpdateSchema = z.object({
    theme: z.enum(themeValues).optional(),
    locale: z.enum(localeValues).optional(),
    dailySummaryEmail: z.boolean().optional(),
    overduePush: z.boolean().optional(),
    teamMentions: z.boolean().optional(),
    aiModel: z.string().max(80).optional(),
});

export const analyticsQuerySchema = z.object({
    workspaceId: id.optional(),
    departmentId: id.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
});

export const workspaceIdQuerySchema = z.object({
    workspaceId: id.optional(),
});
