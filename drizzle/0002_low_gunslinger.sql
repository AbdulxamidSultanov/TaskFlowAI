CREATE TABLE `auth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_attempt_key_idx` ON `auth_attempts` (`key`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`changes` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_activity_task_idx` ON `task_activity` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`depends_on_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dependency_self_check" CHECK("task_dependencies"."task_id" != "task_dependencies"."depends_on_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_dependency_unique_idx` ON `task_dependencies` (`task_id`,`depends_on_id`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`difficulty` integer DEFAULT 1 NOT NULL,
	`reason` text DEFAULT 'none' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "time_range_check" CHECK("time_entries"."end_at" IS NULL OR "time_entries"."end_at" > "time_entries"."start_at"),
	CONSTRAINT "difficulty_check" CHECK("time_entries"."difficulty" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `time_entries_task_idx` ON `time_entries` (`task_id`,`user_id`,`start_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_timer_idx` ON `time_entries` (`user_id`) WHERE "time_entries"."end_at" IS NULL;--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `confirmed_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `generation_mode` text;--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `generation_model` text;--> statement-breakpoint
ALTER TABLE `departments` ADD `workspace_id` text REFERENCES workspaces(id);--> statement-breakpoint
ALTER TABLE `notifications` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_idx` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_inbox_idx` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
-- Preserve the original invalid date values in the task history before repairing them.
INSERT INTO task_activity (id, task_id, actor_id, action, changes, created_at)
SELECT lower(hex(randomblob(16))), id, NULL, 'migration.date_repair', json_object('oldStartDate',start_date,'dueDate',due_date), CAST(strftime('%s','now') AS INTEGER)*1000
FROM tasks WHERE start_date > due_date;
--> statement-breakpoint
UPDATE tasks SET start_date=due_date WHERE start_date>due_date;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`department_id` text NOT NULL,
	`parent_task_id` text,
	`archived_at` integer,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assignee_id` text,
	`creator_id` text NOT NULL,
	`start_date` integer,
	`due_date` integer,
	`estimate_minutes` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tasks_dates_check" CHECK("__new_tasks"."start_date" IS NULL OR "__new_tasks"."due_date" IS NULL OR "__new_tasks"."due_date" >= "__new_tasks"."start_date"),
	CONSTRAINT "tasks_parent_check" CHECK("__new_tasks"."parent_task_id" IS NULL OR "__new_tasks"."parent_task_id" != "__new_tasks"."id"),
	CONSTRAINT "tasks_status_check" CHECK("__new_tasks"."status" IN ('todo','in_progress','under_review','blocked','completed','queued')),
	CONSTRAINT "tasks_priority_check" CHECK("__new_tasks"."priority" IN ('low','medium','high','urgent')),
	CONSTRAINT "tasks_estimate_check" CHECK("__new_tasks"."estimate_minutes" IS NULL OR "__new_tasks"."estimate_minutes" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "workspace_id", "project_id", "department_id", "parent_task_id", "archived_at", "title", "description", "status", "priority", "assignee_id", "creator_id", "start_date", "due_date", "estimate_minutes", "position", "completed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "project_id", "department_id", "parent_task_id", NULL, "title", "description", "status", "priority", "assignee_id", "creator_id", "start_date", "due_date", "estimate_minutes", "position", "completed_at", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tasks_workspace_due_idx` ON `tasks` (`workspace_id`,`due_date`,`created_at`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_idx` ON `tasks` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_department_idx` ON `tasks` (`department_id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `task_reminders` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `reminder_hours` text DEFAULT '24,5,1' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `session_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `manager_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `access_scope` text DEFAULT 'self' NOT NULL;
--> statement-breakpoint
UPDATE departments SET workspace_id = (SELECT workspace_id FROM projects WHERE department_id=departments.id LIMIT 1);
--> statement-breakpoint
-- Existing department managers become team-scoped supervisors, not workspace administrators.
UPDATE workspace_members SET role='member', access_scope='team'
WHERE role='admin' AND user_id IN (SELECT id FROM users WHERE role='manager');
--> statement-breakpoint
UPDATE workspace_members SET manager_user_id = (
 SELECT m.user_id FROM workspace_members m JOIN users manager ON manager.id=m.user_id JOIN users employee ON employee.id=workspace_members.user_id
 WHERE m.workspace_id=workspace_members.workspace_id AND manager.role='manager' AND manager.department_id=employee.department_id AND manager.id!=employee.id LIMIT 1
) WHERE role='member' AND user_id IN (SELECT id FROM users WHERE role='member');
--> statement-breakpoint
UPDATE workspace_members SET manager_user_id=(SELECT owner_id FROM workspaces WHERE id=workspace_members.workspace_id)
WHERE access_scope='team';
