DROP TRIGGER IF EXISTS users_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_members_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_members_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspaces_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspaces_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS notifications_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS notifications_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_messages_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_messages_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_task_drafts_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_task_drafts_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS user_settings_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS user_settings_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS time_entries_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS time_entries_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_invitations_values_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_invitations_values_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_relations_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_relations_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_tags_scope_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_tags_scope_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_scope_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_scope_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_scope_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS calendar_scope_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reporting_scope_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS reporting_scope_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS departments_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspaces_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_task_drafts_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_conversations_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS comments_timestamp;
--> statement-breakpoint
DROP TRIGGER IF EXISTS password_session_version;
--> statement-breakpoint
CREATE TABLE `task_action_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`requested_by_id` text,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_action_target_idx` ON `task_action_requests` (`target_user_id`,`resolved_at`,`task_id`);--> statement-breakpoint
CREATE TABLE `task_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`added_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_participant_unique_idx` ON `task_participants` (`task_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `task_participant_user_idx` ON `task_participants` (`user_id`,`task_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`department_id` text NOT NULL,
	`parent_task_id` text,
	`archived_at` integer,
	`requires_review` integer DEFAULT false NOT NULL,
	`reviewer_id` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`reviewed_by_id` text,
	`block_reason` text,
	`blocked_at` integer,
	`blocked_by_id` text,
	`helper_id` text,
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
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`blocked_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`helper_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tasks_dates_check" CHECK("__new_tasks"."start_date" IS NULL OR "__new_tasks"."due_date" IS NULL OR "__new_tasks"."due_date" >= "__new_tasks"."start_date"),
	CONSTRAINT "tasks_parent_check" CHECK("__new_tasks"."parent_task_id" IS NULL OR "__new_tasks"."parent_task_id" != "__new_tasks"."id"),
	CONSTRAINT "tasks_status_check" CHECK("__new_tasks"."status" IN ('todo','in_progress','under_review','blocked','completed','queued','cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK("__new_tasks"."priority" IN ('low','medium','high','urgent')),
	CONSTRAINT "tasks_estimate_check" CHECK("__new_tasks"."estimate_minutes" IS NULL OR "__new_tasks"."estimate_minutes" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "workspace_id", "project_id", "department_id", "parent_task_id", "archived_at", "requires_review", "reviewer_id", "submitted_at", "reviewed_at", "reviewed_by_id", "block_reason", "blocked_at", "blocked_by_id", "helper_id", "title", "description", "status", "priority", "assignee_id", "creator_id", "start_date", "due_date", "estimate_minutes", "position", "completed_at", "created_at", "updated_at") SELECT "id", "workspace_id", "project_id", "department_id", "parent_task_id", "archived_at", 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, "title", "description", "status", "priority", "assignee_id", "creator_id", "start_date", "due_date", "estimate_minutes", "position", "completed_at", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
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
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_task_id`);
--> statement-breakpoint
CREATE TRIGGER users_values_insert BEFORE INSERT ON users BEGIN
SELECT CASE WHEN NEW.role NOT IN ('admin','manager','member') THEN RAISE(ABORT, 'Invalid users.role') END;
END;
--> statement-breakpoint
CREATE TRIGGER users_values_update BEFORE UPDATE ON users BEGIN
SELECT CASE WHEN NEW.role NOT IN ('admin','manager','member') THEN RAISE(ABORT, 'Invalid users.role') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_members_values_insert BEFORE INSERT ON workspace_members BEGIN
SELECT CASE WHEN NEW.role NOT IN ('owner','admin','member','viewer') THEN RAISE(ABORT, 'Invalid workspace_members.role') END;
SELECT CASE WHEN NEW.access_scope NOT IN ('self','team','workspace') THEN RAISE(ABORT, 'Invalid workspace_members.access_scope') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_members_values_update BEFORE UPDATE ON workspace_members BEGIN
SELECT CASE WHEN NEW.role NOT IN ('owner','admin','member','viewer') THEN RAISE(ABORT, 'Invalid workspace_members.role') END;
SELECT CASE WHEN NEW.access_scope NOT IN ('self','team','workspace') THEN RAISE(ABORT, 'Invalid workspace_members.access_scope') END;
END;
--> statement-breakpoint
CREATE TRIGGER projects_values_insert BEFORE INSERT ON projects BEGIN
SELECT CASE WHEN NEW.status NOT IN ('active','paused','completed','archived') THEN RAISE(ABORT, 'Invalid projects.status') END;
END;
--> statement-breakpoint
CREATE TRIGGER projects_values_update BEFORE UPDATE ON projects BEGIN
SELECT CASE WHEN NEW.status NOT IN ('active','paused','completed','archived') THEN RAISE(ABORT, 'Invalid projects.status') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspaces_values_insert BEFORE INSERT ON workspaces BEGIN
SELECT CASE WHEN NEW.plan NOT IN ('free','pro','business') THEN RAISE(ABORT, 'Invalid workspaces.plan') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspaces_values_update BEFORE UPDATE ON workspaces BEGIN
SELECT CASE WHEN NEW.plan NOT IN ('free','pro','business') THEN RAISE(ABORT, 'Invalid workspaces.plan') END;
END;
--> statement-breakpoint
CREATE TRIGGER notifications_values_insert BEFORE INSERT ON notifications BEGIN
SELECT CASE WHEN NEW.type NOT IN ('task_assigned','task_due','mention','ai','system') THEN RAISE(ABORT, 'Invalid notifications.type') END;
END;
--> statement-breakpoint
CREATE TRIGGER notifications_values_update BEFORE UPDATE ON notifications BEGIN
SELECT CASE WHEN NEW.type NOT IN ('task_assigned','task_due','mention','ai','system') THEN RAISE(ABORT, 'Invalid notifications.type') END;
END;
--> statement-breakpoint
CREATE TRIGGER ai_messages_values_insert BEFORE INSERT ON ai_messages BEGIN
SELECT CASE WHEN NEW.role NOT IN ('system','user','assistant') THEN RAISE(ABORT, 'Invalid ai_messages.role') END;
END;
--> statement-breakpoint
CREATE TRIGGER ai_messages_values_update BEFORE UPDATE ON ai_messages BEGIN
SELECT CASE WHEN NEW.role NOT IN ('system','user','assistant') THEN RAISE(ABORT, 'Invalid ai_messages.role') END;
END;
--> statement-breakpoint
CREATE TRIGGER ai_task_drafts_values_insert BEFORE INSERT ON ai_task_drafts BEGIN
SELECT CASE WHEN NEW.state NOT IN ('draft','published','rejected') THEN RAISE(ABORT, 'Invalid ai_task_drafts.state') END;
SELECT CASE WHEN NEW.priority NOT IN ('low','medium','high','urgent') THEN RAISE(ABORT, 'Invalid ai_task_drafts.priority') END;
END;
--> statement-breakpoint
CREATE TRIGGER ai_task_drafts_values_update BEFORE UPDATE ON ai_task_drafts BEGIN
SELECT CASE WHEN NEW.state NOT IN ('draft','published','rejected') THEN RAISE(ABORT, 'Invalid ai_task_drafts.state') END;
SELECT CASE WHEN NEW.priority NOT IN ('low','medium','high','urgent') THEN RAISE(ABORT, 'Invalid ai_task_drafts.priority') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_settings_values_insert BEFORE INSERT ON user_settings BEGIN
SELECT CASE WHEN NEW.theme NOT IN ('light','dark','system') THEN RAISE(ABORT, 'Invalid user_settings.theme') END;
SELECT CASE WHEN NEW.locale NOT IN ('ru','uz','en') THEN RAISE(ABORT, 'Invalid user_settings.locale') END;
END;
--> statement-breakpoint
CREATE TRIGGER user_settings_values_update BEFORE UPDATE ON user_settings BEGIN
SELECT CASE WHEN NEW.theme NOT IN ('light','dark','system') THEN RAISE(ABORT, 'Invalid user_settings.theme') END;
SELECT CASE WHEN NEW.locale NOT IN ('ru','uz','en') THEN RAISE(ABORT, 'Invalid user_settings.locale') END;
END;
--> statement-breakpoint
CREATE TRIGGER time_entries_values_insert BEFORE INSERT ON time_entries BEGIN
SELECT CASE WHEN NEW.reason NOT IN ('none','unclear_requirements','waiting','technical','rework','interruption','other') THEN RAISE(ABORT, 'Invalid time_entries.reason') END;
END;
--> statement-breakpoint
CREATE TRIGGER time_entries_values_update BEFORE UPDATE ON time_entries BEGIN
SELECT CASE WHEN NEW.reason NOT IN ('none','unclear_requirements','waiting','technical','rework','interruption','other') THEN RAISE(ABORT, 'Invalid time_entries.reason') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_invitations_values_insert BEFORE INSERT ON workspace_invitations BEGIN
SELECT CASE WHEN NEW.role NOT IN ('member','viewer') THEN RAISE(ABORT, 'Invalid workspace_invitations.role') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_invitations_values_update BEFORE UPDATE ON workspace_invitations BEGIN
SELECT CASE WHEN NEW.role NOT IN ('member','viewer') THEN RAISE(ABORT, 'Invalid workspace_invitations.role') END;
END;
--> statement-breakpoint
CREATE TRIGGER tasks_relations_insert BEFORE INSERT ON tasks BEGIN

SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND department_id=NEW.department_id) THEN RAISE(ABORT,'Task project/workspace/department mismatch') END;
SELECT CASE WHEN NEW.assignee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE user_id=NEW.assignee_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Task assignee is not a workspace member') END;
SELECT CASE WHEN NEW.parent_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_task_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Task parent outside workspace') END;
SELECT CASE WHEN NEW.parent_task_id IS NOT NULL AND EXISTS(WITH RECURSIVE ancestors(id) AS (SELECT NEW.parent_task_id UNION SELECT parent_task_id FROM tasks JOIN ancestors ON tasks.id=ancestors.id WHERE parent_task_id IS NOT NULL) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE(ABORT,'Task parent cycle') END;

END;
--> statement-breakpoint
CREATE TRIGGER tasks_relations_update BEFORE UPDATE ON tasks BEGIN

SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND department_id=NEW.department_id) THEN RAISE(ABORT,'Task project/workspace/department mismatch') END;
SELECT CASE WHEN NEW.assignee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE user_id=NEW.assignee_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Task assignee is not a workspace member') END;
SELECT CASE WHEN NEW.parent_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_task_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Task parent outside workspace') END;
SELECT CASE WHEN NEW.parent_task_id IS NOT NULL AND EXISTS(WITH RECURSIVE ancestors(id) AS (SELECT NEW.parent_task_id UNION SELECT parent_task_id FROM tasks JOIN ancestors ON tasks.id=ancestors.id WHERE parent_task_id IS NOT NULL) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE(ABORT,'Task parent cycle') END;

END;
--> statement-breakpoint
CREATE TRIGGER task_tags_scope_insert BEFORE INSERT ON task_tags BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tasks t JOIN tags g ON g.id=NEW.tag_id WHERE t.id=NEW.task_id AND t.workspace_id=g.workspace_id) THEN RAISE(ABORT,'Tag workspace mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER task_tags_scope_update BEFORE UPDATE ON task_tags BEGIN
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tasks t JOIN tags g ON g.id=NEW.tag_id WHERE t.id=NEW.task_id AND t.workspace_id=g.workspace_id) THEN RAISE(ABORT,'Tag workspace mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER projects_scope_insert BEFORE INSERT ON projects BEGIN

SELECT CASE WHEN NEW.start_date IS NOT NULL AND NEW.due_date IS NOT NULL AND NEW.start_date>NEW.due_date THEN RAISE(ABORT,'Invalid project dates') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Project department outside workspace') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workspace_members WHERE user_id=NEW.owner_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Project owner outside workspace') END;

END;
--> statement-breakpoint
CREATE TRIGGER projects_scope_update BEFORE UPDATE ON projects BEGIN

SELECT CASE WHEN NEW.start_date IS NOT NULL AND NEW.due_date IS NOT NULL AND NEW.start_date>NEW.due_date THEN RAISE(ABORT,'Invalid project dates') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Project department outside workspace') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM workspace_members WHERE user_id=NEW.owner_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Project owner outside workspace') END;

END;
--> statement-breakpoint
CREATE TRIGGER calendar_scope_insert BEFORE INSERT ON calendar_events BEGIN

SELECT CASE WHEN NEW.end_at<=NEW.start_at THEN RAISE(ABORT,'Invalid calendar range') END;
SELECT CASE WHEN NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND (NEW.department_id IS NULL OR department_id=NEW.department_id)) THEN RAISE(ABORT,'Calendar project mismatch') END;
SELECT CASE WHEN NEW.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks WHERE id=NEW.task_id AND workspace_id=NEW.workspace_id AND (NEW.project_id IS NULL OR project_id=NEW.project_id)) THEN RAISE(ABORT,'Calendar task mismatch') END;
SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Calendar department mismatch') END;

END;
--> statement-breakpoint
CREATE TRIGGER calendar_scope_update BEFORE UPDATE ON calendar_events BEGIN

SELECT CASE WHEN NEW.end_at<=NEW.start_at THEN RAISE(ABORT,'Invalid calendar range') END;
SELECT CASE WHEN NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND workspace_id=NEW.workspace_id AND (NEW.department_id IS NULL OR department_id=NEW.department_id)) THEN RAISE(ABORT,'Calendar project mismatch') END;
SELECT CASE WHEN NEW.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tasks WHERE id=NEW.task_id AND workspace_id=NEW.workspace_id AND (NEW.project_id IS NULL OR project_id=NEW.project_id)) THEN RAISE(ABORT,'Calendar task mismatch') END;
SELECT CASE WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Calendar department mismatch') END;

END;
--> statement-breakpoint
CREATE TRIGGER reporting_scope_insert BEFORE INSERT ON workspace_members BEGIN

SELECT CASE WHEN NEW.manager_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.manager_user_id) THEN RAISE(ABORT,'Manager outside workspace') END;
SELECT CASE WHEN NEW.manager_user_id IS NOT NULL AND EXISTS(WITH RECURSIVE managers(id) AS (SELECT NEW.manager_user_id UNION SELECT manager_user_id FROM workspace_members JOIN managers ON user_id=managers.id WHERE workspace_id=NEW.workspace_id AND manager_user_id IS NOT NULL) SELECT 1 FROM managers WHERE id=NEW.user_id) THEN RAISE(ABORT,'Reporting cycle') END;

END;
--> statement-breakpoint
CREATE TRIGGER reporting_scope_update BEFORE UPDATE ON workspace_members BEGIN

SELECT CASE WHEN NEW.manager_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.manager_user_id) THEN RAISE(ABORT,'Manager outside workspace') END;
SELECT CASE WHEN NEW.manager_user_id IS NOT NULL AND EXISTS(WITH RECURSIVE managers(id) AS (SELECT NEW.manager_user_id UNION SELECT manager_user_id FROM workspace_members JOIN managers ON user_id=managers.id WHERE workspace_id=NEW.workspace_id AND manager_user_id IS NOT NULL) SELECT 1 FROM managers WHERE id=NEW.user_id) THEN RAISE(ABORT,'Reporting cycle') END;

END;
--> statement-breakpoint
CREATE TRIGGER tasks_timestamp AFTER UPDATE ON tasks WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE tasks SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER projects_timestamp AFTER UPDATE ON projects WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE projects SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER users_timestamp AFTER UPDATE ON users WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE users SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER departments_timestamp AFTER UPDATE ON departments WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE departments SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER workspaces_timestamp AFTER UPDATE ON workspaces WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE workspaces SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER ai_task_drafts_timestamp AFTER UPDATE ON ai_task_drafts WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE ai_task_drafts SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER ai_conversations_timestamp AFTER UPDATE ON ai_conversations WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE ai_conversations SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER comments_timestamp AFTER UPDATE ON comments WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE comments SET updated_at=max(OLD.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER password_session_version AFTER UPDATE OF password_hash ON users WHEN NEW.password_hash!=OLD.password_hash AND NEW.session_version=OLD.session_version BEGIN UPDATE users SET session_version=session_version+1 WHERE id=NEW.id; END;

--> statement-breakpoint
UPDATE tasks SET requires_review=1,reviewer_id=coalesce((SELECT manager_user_id FROM workspace_members WHERE workspace_id=tasks.workspace_id AND user_id=tasks.assignee_id),(SELECT owner_id FROM workspaces WHERE id=tasks.workspace_id)),submitted_at=updated_at WHERE status='under_review';
--> statement-breakpoint
UPDATE tasks SET blocked_at=updated_at,blocked_by_id=creator_id WHERE status='blocked';
--> statement-breakpoint
INSERT INTO task_action_requests(id,task_id,target_user_id,requested_by_id,kind,reason,created_at)
SELECT lower(hex(randomblob(16))),id,reviewer_id,assignee_id,'review','Review task result',submitted_at FROM tasks WHERE status='under_review' AND reviewer_id IS NOT NULL AND reviewer_id!=assignee_id;
