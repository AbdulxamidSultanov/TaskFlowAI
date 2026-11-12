import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
    check,
    type AnySQLiteColumn,
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
    text("id")
        .primaryKey()
        .$defaultFn(() => randomUUID());

const createdAt = () =>
    integer("created_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date());

const updatedAt = () =>
    integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$defaultFn(() => new Date());

export const departments = sqliteTable(
    "departments",
    {
        id: id(),
        workspaceId: text("workspace_id").references(
            (): AnySQLiteColumn => workspaces.id,
            { onDelete: "cascade" },
        ),
        name: text("name").notNull(),
        slug: text("slug").notNull(),
        description: text("description"),
        color: text("color").notNull().default("#4F46E5"),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [uniqueIndex("departments_slug_idx").on(table.slug)],
);

export const users = sqliteTable(
    "users",
    {
        id: id(),
        email: text("email").notNull(),
        passwordHash: text("password_hash").notNull(),
        sessionVersion: integer("session_version").notNull().default(0),
        name: text("name").notNull(),
        role: text("role", { enum: ["admin", "manager", "member"] })
            .notNull()
            .default("member"),
        departmentId: text("department_id").references(() => departments.id, {
            onDelete: "set null",
        }),
        jobTitle: text("job_title"),
        avatarUrl: text("avatar_url"),
        timezone: text("timezone").notNull().default("Asia/Tashkent"),
        isActive: integer("is_active", { mode: "boolean" })
            .notNull()
            .default(true),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
        uniqueIndex("users_email_idx").on(table.email),
        index("users_department_idx").on(table.departmentId),
    ],
);

export const workspaces = sqliteTable(
    "workspaces",
    {
        id: id(),
        name: text("name").notNull(),
        slug: text("slug").notNull(),
        ownerId: text("owner_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        plan: text("plan", { enum: ["free", "pro", "business"] })
            .notNull()
            .default("free"),
        storageUsedBytes: integer("storage_used_bytes").notNull().default(0),
        storageLimitBytes: integer("storage_limit_bytes")
            .notNull()
            .default(5 * 1024 * 1024 * 1024),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [uniqueIndex("workspaces_slug_idx").on(table.slug)],
);

export const workspaceMembers = sqliteTable(
    "workspace_members",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: text("role", { enum: ["owner", "admin", "member", "viewer"] })
            .notNull()
            .default("member"),
        managerUserId: text("manager_user_id").references(
            (): AnySQLiteColumn => users.id,
            { onDelete: "set null" },
        ),
        accessScope: text("access_scope", {
            enum: ["self", "team", "workspace"],
        })
            .notNull()
            .default("self"),
        joinedAt: integer("joined_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex("workspace_members_unique_idx").on(
            table.workspaceId,
            table.userId,
        ),
        index("workspace_members_user_idx").on(table.userId),
    ],
);

export const projects = sqliteTable(
    "projects",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        departmentId: text("department_id")
            .notNull()
            .references(() => departments.id, { onDelete: "restrict" }),
        name: text("name").notNull(),
        key: text("key").notNull(),
        description: text("description"),
        color: text("color").notNull().default("#4F46E5"),
        status: text("status", {
            enum: ["active", "paused", "completed", "archived"],
        })
            .notNull()
            .default("active"),
        ownerId: text("owner_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        startDate: integer("start_date", { mode: "timestamp_ms" }),
        dueDate: integer("due_date", { mode: "timestamp_ms" }),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
        uniqueIndex("projects_workspace_key_idx").on(
            table.workspaceId,
            table.key,
        ),
        index("projects_department_idx").on(table.departmentId),
        index("projects_workspace_idx").on(table.workspaceId),
    ],
);

export const tasks = sqliteTable(
    "tasks",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        departmentId: text("department_id")
            .notNull()
            .references(() => departments.id, { onDelete: "restrict" }),
        parentTaskId: text("parent_task_id").references(
            (): AnySQLiteColumn => tasks.id,
            { onDelete: "set null" },
        ),
        archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
        title: text("title").notNull(),
        description: text("description"),
        status: text("status", {
            enum: [
                "todo",
                "in_progress",
                "under_review",
                "blocked",
                "completed",
                "queued",
            ],
        })
            .notNull()
            .default("todo"),
        priority: text("priority", {
            enum: ["low", "medium", "high", "urgent"],
        })
            .notNull()
            .default("medium"),
        assigneeId: text("assignee_id").references(() => users.id, {
            onDelete: "set null",
        }),
        creatorId: text("creator_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        startDate: integer("start_date", { mode: "timestamp_ms" }),
        dueDate: integer("due_date", { mode: "timestamp_ms" }),
        estimateMinutes: integer("estimate_minutes"),
        position: integer("position").notNull().default(0),
        completedAt: integer("completed_at", { mode: "timestamp_ms" }),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
        check(
            "tasks_dates_check",
            sql`${table.startDate} IS NULL OR ${table.dueDate} IS NULL OR ${table.dueDate} >= ${table.startDate}`,
        ),
        check(
            "tasks_parent_check",
            sql`${table.parentTaskId} IS NULL OR ${table.parentTaskId} != ${table.id}`,
        ),
        check(
            "tasks_status_check",
            sql`${table.status} IN ('todo','in_progress','under_review','blocked','completed','queued')`,
        ),
        check(
            "tasks_priority_check",
            sql`${table.priority} IN ('low','medium','high','urgent')`,
        ),
        check(
            "tasks_estimate_check",
            sql`${table.estimateMinutes} IS NULL OR ${table.estimateMinutes} >= 0`,
        ),
        index("tasks_workspace_due_idx").on(
            table.workspaceId,
            table.dueDate,
            table.createdAt,
        ),
        index("tasks_workspace_idx").on(table.workspaceId),
        index("tasks_project_idx").on(table.projectId),
        index("tasks_department_idx").on(table.departmentId),
        index("tasks_assignee_idx").on(table.assigneeId),
        index("tasks_status_idx").on(table.status),
        index("tasks_due_idx").on(table.dueDate),
        index("tasks_parent_idx").on(table.parentTaskId),
    ],
);

export const tags = sqliteTable(
    "tags",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        color: text("color").notNull().default("#64748B"),
        createdAt: createdAt(),
    },
    (table) => [
        uniqueIndex("tags_workspace_name_idx").on(
            table.workspaceId,
            table.name,
        ),
    ],
);

export const taskTags = sqliteTable(
    "task_tags",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
        tagId: text("tag_id")
            .notNull()
            .references(() => tags.id, { onDelete: "cascade" }),
    },
    (table) => [
        uniqueIndex("task_tags_unique_idx").on(table.taskId, table.tagId),
        index("task_tags_tag_idx").on(table.tagId),
    ],
);

export const comments = sqliteTable(
    "comments",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
        authorId: text("author_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        body: text("body").notNull(),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [index("comments_task_idx").on(table.taskId)],
);

export const calendarEvents = sqliteTable(
    "calendar_events",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        departmentId: text("department_id").references(() => departments.id, {
            onDelete: "set null",
        }),
        projectId: text("project_id").references(() => projects.id, {
            onDelete: "set null",
        }),
        taskId: text("task_id").references(() => tasks.id, {
            onDelete: "set null",
        }),
        title: text("title").notNull(),
        description: text("description"),
        startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
        endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
        allDay: integer("all_day", { mode: "boolean" })
            .notNull()
            .default(false),
        location: text("location"),
        createdById: text("created_by_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
        index("calendar_workspace_idx").on(table.workspaceId),
        index("calendar_start_idx").on(table.startAt),
        index("calendar_department_idx").on(table.departmentId),
    ],
);

export const notifications = sqliteTable(
    "notifications",
    {
        id: id(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        dedupeKey: text("dedupe_key"),
        type: text("type", {
            enum: ["task_assigned", "task_due", "mention", "ai", "system"],
        })
            .notNull()
            .default("system"),
        title: text("title").notNull(),
        body: text("body"),
        entityType: text("entity_type"),
        entityId: text("entity_id"),
        readAt: integer("read_at", { mode: "timestamp_ms" }),
        createdAt: createdAt(),
    },
    (table) => [
        uniqueIndex("notifications_dedupe_idx").on(table.dedupeKey),
        index("notifications_inbox_idx").on(
            table.userId,
            table.readAt,
            table.createdAt,
        ),
        index("notifications_user_idx").on(table.userId),
        index("notifications_read_idx").on(table.readAt),
    ],
);

export const aiConversations = sqliteTable(
    "ai_conversations",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        model: text("model").notNull().default("taskflow-rules-v1"),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
        index("ai_conversations_user_idx").on(table.userId),
        index("ai_conversations_workspace_idx").on(table.workspaceId),
    ],
);

export const aiMessages = sqliteTable(
    "ai_messages",
    {
        id: id(),
        conversationId: text("conversation_id")
            .notNull()
            .references(() => aiConversations.id, { onDelete: "cascade" }),
        role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
        content: text("content").notNull(),
        createdAt: createdAt(),
    },
    (table) => [index("ai_messages_conversation_idx").on(table.conversationId)],
);

export const aiPlans = sqliteTable(
    "ai_plans",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        date: integer("date", { mode: "timestamp_ms" }).notNull(),
        summary: text("summary").notNull(),
        rationale: text("rationale").notNull(),
        availableMinutes: integer("available_minutes").notNull().default(480),
        createdAt: createdAt(),
    },
    (table) => [
        index("ai_plans_user_idx").on(table.userId),
        index("ai_plans_workspace_idx").on(table.workspaceId),
    ],
);

export const aiPlanItems = sqliteTable(
    "ai_plan_items",
    {
        id: id(),
        planId: text("plan_id")
            .notNull()
            .references(() => aiPlans.id, { onDelete: "cascade" }),
        taskId: text("task_id").references(() => tasks.id, {
            onDelete: "set null",
        }),
        startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
        endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
        position: integer("position").notNull().default(0),
        reason: text("reason"),
    },
    (table) => [index("ai_plan_items_plan_idx").on(table.planId)],
);

export const aiTaskDrafts = sqliteTable(
    "ai_task_drafts",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        batchId: text("batch_id").notNull(),
        projectId: text("project_id").references(() => projects.id, {
            onDelete: "set null",
        }),
        departmentId: text("department_id").references(() => departments.id, {
            onDelete: "set null",
        }),
        title: text("title").notNull(),
        description: text("description"),
        priority: text("priority", {
            enum: ["low", "medium", "high", "urgent"],
        })
            .notNull()
            .default("medium"),
        suggestedDeadline: integer("suggested_deadline", {
            mode: "timestamp_ms",
        }),
        suggestedAssigneeId: text("suggested_assignee_id").references(
            () => users.id,
            { onDelete: "set null" },
        ),
        estimateMinutes: integer("estimate_minutes"),
        state: text("state", {
            enum: ["draft", "published", "rejected"],
        })
            .notNull()
            .default("draft"),
        confirmedById: text("confirmed_by_id").references(() => users.id, {
            onDelete: "set null",
        }),
        confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
        generationMode: text("generation_mode"),
        generationModel: text("generation_model"),
        publishedTaskId: text("published_task_id").references(() => tasks.id, {
            onDelete: "set null",
        }),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
        index("ai_task_drafts_workspace_idx").on(table.workspaceId),
        index("ai_task_drafts_user_idx").on(table.userId),
        index("ai_task_drafts_state_idx").on(table.state),
        index("ai_task_drafts_batch_idx").on(table.batchId),
    ],
);

export const sessions = sqliteTable(
    "sessions",
    {
        id: id(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull(),
        expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
        createdAt: createdAt(),
        lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" })
            .notNull()
            .$defaultFn(() => new Date()),
        userAgent: text("user_agent"),
        ip: text("ip"),
    },
    (table) => [
        uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
        index("sessions_user_idx").on(table.userId),
    ],
);

export const userSettings = sqliteTable("user_settings", {
    userId: text("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
    taskReminders: integer("task_reminders", { mode: "boolean" })
        .notNull()
        .default(true),
    reminderHours: text("reminder_hours").notNull().default("24,5,1"),
    theme: text("theme", { enum: ["light", "dark", "system"] })
        .notNull()
        .default("system"),
    locale: text("locale", { enum: ["ru", "uz", "en"] })
        .notNull()
        .default("ru"),
    dailySummaryEmail: integer("daily_summary_email", { mode: "boolean" })
        .notNull()
        .default(true),
    overduePush: integer("overdue_push", { mode: "boolean" })
        .notNull()
        .default(true),
    teamMentions: integer("team_mentions", { mode: "boolean" })
        .notNull()
        .default(true),
    aiModel: text("ai_model").notNull().default("taskflow-rules-v1"),
    updatedAt: updatedAt(),
});

export type Department = typeof departments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
export type AiPlan = typeof aiPlans.$inferSelect;

export const timeEntries = sqliteTable(
    "time_entries",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
        endAt: integer("end_at", { mode: "timestamp_ms" }),
        difficulty: integer("difficulty").notNull().default(1),
        reason: text("reason", {
            enum: [
                "none",
                "unclear_requirements",
                "waiting",
                "technical",
                "rework",
                "interruption",
                "other",
            ],
        })
            .notNull()
            .default("none"),
        note: text("note").notNull().default(""),
        createdAt: createdAt(),
    },
    (t) => [
        check(
            "time_range_check",
            sql`${t.endAt} IS NULL OR ${t.endAt} > ${t.startAt}`,
        ),
        check("difficulty_check", sql`${t.difficulty} BETWEEN 1 AND 5`),
        index("time_entries_task_idx").on(t.taskId, t.userId, t.startAt),
        uniqueIndex("one_running_timer_idx")
            .on(t.userId)
            .where(sql`${t.endAt} IS NULL`),
    ],
);

export const taskActivity = sqliteTable(
    "task_activity",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
        actorId: text("actor_id").references(() => users.id, {
            onDelete: "set null",
        }),
        action: text("action").notNull(),
        changes: text("changes").notNull().default("{}"),
        createdAt: createdAt(),
    },
    (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt)],
);

export const taskDependencies = sqliteTable(
    "task_dependencies",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
        dependsOnId: text("depends_on_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
    },
    (t) => [
        uniqueIndex("task_dependency_unique_idx").on(t.taskId, t.dependsOnId),
        check("dependency_self_check", sql`${t.taskId} != ${t.dependsOnId}`),
    ],
);

export const authAttempts = sqliteTable(
    "auth_attempts",
    {
        id: id(),
        key: text("key").notNull(),
        createdAt: createdAt(),
    },
    (t) => [index("auth_attempt_key_idx").on(t.key, t.createdAt)],
);

// Kept separately from inbox items so dismissing a notification never resends it.
export const reminderDeliveries = sqliteTable("reminder_deliveries", {
    key: text("key").primaryKey(),
    taskId: text("task_id")
        .notNull()
        .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
});

export const workspaceInvitations = sqliteTable(
    "workspace_invitations",
    {
        id: id(),
        workspaceId: text("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        tokenHash: text("token_hash").notNull(),
        role: text("role", { enum: ["member", "viewer"] })
            .notNull()
            .default("member"),
        createdById: text("created_by_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
        acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
        createdAt: createdAt(),
    },
    (t) => [uniqueIndex("invitation_token_idx").on(t.tokenHash)],
);
export const taskAttachments = sqliteTable(
    "task_attachments",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, { onDelete: "cascade" }),
        uploadedById: text("uploaded_by_id").references(() => users.id, {
            onDelete: "set null",
        }),
        name: text("name").notNull(),
        storageKey: text("storage_key").notNull(),
        size: integer("size").notNull(),
        createdAt: createdAt(),
    },
    (t) => [
        index("attachments_task_idx").on(t.taskId),
        check("attachment_size_check", sql`${t.size}>=0`),
    ],
);
