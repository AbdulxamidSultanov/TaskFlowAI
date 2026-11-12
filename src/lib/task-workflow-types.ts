import type { Task } from "@/lib/redux/types";
import type { TaskPermissions } from "@/lib/auth/task-rights";
export type TaskActionRequest = {
    id: string;
    kind: "review" | "response" | "unblock";
    reason: string;
    targetUserId: string;
    createdAt: string;
};
export type BoardTask = Task & {
    assigneeName: string | null;
    permissions: TaskPermissions;
    actions: TaskActionRequest[];
    requiresReview: boolean;
    blockReason: string | null;
    helperId: string | null;
    reviewerId: string | null;
    blockedAt: string | null;
};
export type DayBoard = {
    day: string;
    timeZone: string;
    uniqueCount: number;
    groups: Partial<
        Record<
            "today" | "overdue" | "action" | "blocked" | "review",
            BoardTask[]
        >
    >;
};
export type WorkflowCommand = {
    action:
        | "submit"
        | "accept"
        | "rework"
        | "block"
        | "unblock"
        | "request"
        | "resolve"
        | "cancel";
    reason?: string;
    targetUserId?: string | null;
    requestId?: string;
};
export type Participant = {
    id: string;
    userId: string;
    name: string;
    role: "viewer" | "contributor";
    department: string | null;
};
