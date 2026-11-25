ALTER TABLE `ai_task_drafts` ADD `action_type` text DEFAULT 'create_task' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `target_task_id` text REFERENCES tasks(id);--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `suggested_status` text;--> statement-breakpoint
ALTER TABLE `ai_task_drafts` ADD `suggested_reason` text;