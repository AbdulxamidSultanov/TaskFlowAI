export const taskStatuses = [
    "todo",
    "queued",
    "in_progress",
    "under_review",
    "blocked",
    "completed",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const projectStatuses = [
    "active",
    "paused",
    "completed",
    "archived",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const userRoles = ["admin", "manager", "member"] as const;
export type UserRole = (typeof userRoles)[number];

export const workspaceRoles = [
    "owner",
    "admin",
    "member",
    "viewer",
] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspacePlans = ["free", "pro", "business"] as const;
export type WorkspacePlan = (typeof workspacePlans)[number];

export const notificationTypes = [
    "task_assigned",
    "task_due",
    "mention",
    "ai",
    "system",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const themeValues = ["light", "dark", "system"] as const;
export type ThemeValue = (typeof themeValues)[number];

export const localeValues = ["ru", "uz", "en"] as const;
export type LocaleValue = (typeof localeValues)[number];

export const aiRoles = ["system", "user", "assistant"] as const;
export type AiRole = (typeof aiRoles)[number];

export function isCompleted(status: TaskStatus) {
    return status === "completed";
}

export function statusLabel(status: TaskStatus) {
    const labels: Record<TaskStatus, string> = {
        todo: "Todo",
        queued: "Queued",
        in_progress: "In progress",
        under_review: "Under review",
        blocked: "Blocked",
        completed: "Completed",
    };
    return labels[status];
}

export function priorityWeight(priority: TaskPriority) {
    return {
        low: 1,
        medium: 2,
        high: 3,
        urgent: 4,
    }[priority];
}

export function priorityLabel(priority: TaskPriority) {
    const labels: Record<TaskPriority, string> = {
        low: "Low",
        medium: "Medium",
        high: "High",
        urgent: "Urgent",
    };
    return labels[priority];
}
