export const timeReasons = [
    "none",
    "unclear_requirements",
    "waiting",
    "technical",
    "rework",
    "interruption",
    "other",
] as const;
export type TimeReason = (typeof timeReasons)[number];
export type TimeEntry = {
    id: string;
    taskId: string;
    userId: string;
    taskTitle: string;
    userName: string;
    startAt: string;
    endAt: string | null;
    difficulty: number;
    reason: TimeReason;
    note: string;
    minutes: number;
};
export type TimeReport = {
    entries: TimeEntry[];
    running: TimeEntry | null;
    tasks: {
        id: string;
        title: string;
        estimateMinutes: number | null;
        minutes: number;
        entries: number;
        difficulty: number;
        overrun: boolean;
        reasons: { reason: TimeReason; minutes: number }[];
    }[];
    totals: {
        minutes: number;
        entries: number;
        tasks: number;
        overruns: number;
    };
    reasons: { reason: TimeReason; minutes: number }[];
};
