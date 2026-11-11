CREATE TABLE `ai_task_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`project_id` text,
	`department_id` text,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`suggested_deadline` integer,
	`suggested_assignee_id` text,
	`estimate_minutes` integer,
	`state` text DEFAULT 'draft' NOT NULL,
	`published_task_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`suggested_assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`published_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_task_drafts_workspace_idx` ON `ai_task_drafts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `ai_task_drafts_user_idx` ON `ai_task_drafts` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_task_drafts_state_idx` ON `ai_task_drafts` (`state`);--> statement-breakpoint
CREATE INDEX `ai_task_drafts_batch_idx` ON `ai_task_drafts` (`batch_id`);