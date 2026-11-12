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
