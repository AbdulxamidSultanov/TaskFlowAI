import { randomUUID } from "node:crypto";

import {
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
    integer("created_at", {mode: "timestamp_ms"})
        .notNull()
        .$defaultFn(() => new Date());

const updatedAt = () =>
    integer("updated_at", {mode: "timestamp_ms"})
        .notNull()
        .$defaultFn(() => new Date());

export const departments = sqliteTable(
    "departments",
    {
        id: id(),
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
        name: text("name").notNull(),
        role: text("role", {enum: ["admin", "manager", "member"]})
            .notNull()
            .default("member"),
        departmentId: text("department_id").references(() => departments.id, {
            onDelete: "set null",
        }),
        jobTitle: text("job_title"),
        avatarUrl: text("avatar_url"),
        timezone: text("timezone").notNull().default("Asia/Tashkent"),
        isActive: integer("is_active", {mode: "boolean"})
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
            .references(() => users.id, {onDelete: "restrict"}),
        plan: text("plan", {enum: ["free", "pro", "business"]})
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, {onDelete: "cascade"}),
        role: text("role", {enum: ["owner", "admin", "member", "viewer"]})
            .notNull()
            .default("member"),
        joinedAt: integer("joined_at", {mode: "timestamp_ms"})
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
        departmentId: text("department_id")
            .notNull()
            .references(() => departments.id, {onDelete: "restrict"}),
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
            .references(() => users.id, {onDelete: "restrict"}),
        startDate: integer("start_date", {mode: "timestamp_ms"}),
        dueDate: integer("due_date", {mode: "timestamp_ms"}),
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
        projectId: text("project_id")
            .notNull()
            .references(() => projects.id, {onDelete: "cascade"}),
        departmentId: text("department_id")
            .notNull()
            .references(() => departments.id, {onDelete: "restrict"}),
        parentTaskId: text("parent_task_id"),
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
            .references(() => users.id, {onDelete: "restrict"}),
        startDate: integer("start_date", {mode: "timestamp_ms"}),
        dueDate: integer("due_date", {mode: "timestamp_ms"}),
        estimateMinutes: integer("estimate_minutes"),
        position: integer("position").notNull().default(0),
        completedAt: integer("completed_at", {mode: "timestamp_ms"}),
        createdAt: createdAt(),
        updatedAt: updatedAt(),
    },
    (table) => [
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
        name: text("name").notNull(),
        color: text("color").notNull().default("#64748B"),
        createdAt: createdAt(),
    },
    (table) => [
        uniqueIndex("tags_workspace_name_idx").on(table.workspaceId, table.name),
    ],
);

export const taskTags = sqliteTable(
    "task_tags",
    {
        id: id(),
        taskId: text("task_id")
            .notNull()
            .references(() => tasks.id, {onDelete: "cascade"}),
        tagId: text("tag_id")
            .notNull()
            .references(() => tags.id, {onDelete: "cascade"}),
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
            .references(() => tasks.id, {onDelete: "cascade"}),
        authorId: text("author_id")
            .notNull()
            .references(() => users.id, {onDelete: "cascade"}),
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
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
        startAt: integer("start_at", {mode: "timestamp_ms"}).notNull(),
        endAt: integer("end_at", {mode: "timestamp_ms"}).notNull(),
        allDay: integer("all_day", {mode: "boolean"}).notNull().default(false),
        location: text("location"),
        createdById: text("created_by_id")
            .notNull()
            .references(() => users.id, {onDelete: "restrict"}),
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
            .references(() => users.id, {onDelete: "cascade"}),
        type: text("type", {
            enum: ["task_assigned", "task_due", "mention", "ai", "system"],
        })
            .notNull()
            .default("system"),
        title: text("title").notNull(),
        body: text("body"),
        entityType: text("entity_type"),
        entityId: text("entity_id"),
        readAt: integer("read_at", {mode: "timestamp_ms"}),
        createdAt: createdAt(),
    },
    (table) => [
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, {onDelete: "cascade"}),
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
            .references(() => aiConversations.id, {onDelete: "cascade"}),
        role: text("role", {enum: ["system", "user", "assistant"]}).notNull(),
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
            .references(() => workspaces.id, {onDelete: "cascade"}),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, {onDelete: "cascade"}),
        date: integer("date", {mode: "timestamp_ms"}).notNull(),
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
            .references(() => aiPlans.id, {onDelete: "cascade"}),
        taskId: text("task_id").references(() => tasks.id, {
            onDelete: "set null",
        }),
        startAt: integer("start_at", {mode: "timestamp_ms"}).notNull(),
        endAt: integer("end_at", {mode: "timestamp_ms"}).notNull(),
        position: integer("position").notNull().default(0),
        reason: text("reason"),
    },
    (table) => [index("ai_plan_items_plan_idx").on(table.planId)],
);

export const sessions = sqliteTable(
    "sessions",
    {
        id: id(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, {onDelete: "cascade"}),
        tokenHash: text("token_hash").notNull(),
        expiresAt: integer("expires_at", {mode: "timestamp_ms"}).notNull(),
        createdAt: createdAt(),
        lastUsedAt: integer("last_used_at", {mode: "timestamp_ms"})
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
        .references(() => users.id, {onDelete: "cascade"}),
    theme: text("theme", {enum: ["light", "dark", "system"]})
        .notNull()
        .default("system"),
    locale: text("locale", {enum: ["ru", "uz", "en"]})
        .notNull()
        .default("ru"),
    dailySummaryEmail: integer("daily_summary_email", {mode: "boolean"})
        .notNull()
        .default(true),
    overduePush: integer("overdue_push", {mode: "boolean"})
        .notNull()
        .default(true),
    teamMentions: integer("team_mentions", {mode: "boolean"})
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
