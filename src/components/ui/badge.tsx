"use client";

import type {ReactNode} from "react";

import {cn} from "@/lib/utils";
import type {
    ProjectStatus,
    TaskPriority,
    TaskStatus,
    WorkspaceRole,
} from "@/lib/domain";

type BadgeTone =
    | "neutral"
    | "primary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "accent";

const tones: Record<BadgeTone, string> = {
    neutral: "bg-surface-hover text-text-secondary border-border",
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    danger: "bg-error/10 text-error border-error/20",
    info: "bg-info/10 text-info border-info/20",
    accent: "bg-accent/10 text-accent border-accent/20",
};

export function Badge({
    tone = "neutral",
    className,
    children,
}: {
    tone?: BadgeTone;
    className?: string;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
                tones[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}

export const statusTone: Record<TaskStatus, BadgeTone> = {
    todo: "neutral",
    queued: "info",
    in_progress: "primary",
    under_review: "warning",
    blocked: "danger",
    completed: "success",
};

export const priorityTone: Record<TaskPriority, BadgeTone> = {
    low: "neutral",
    medium: "info",
    high: "warning",
    urgent: "danger",
};

export const projectTone: Record<ProjectStatus, BadgeTone> = {
    active: "success",
    paused: "warning",
    completed: "primary",
    archived: "neutral",
};

export const roleTone: Record<WorkspaceRole, BadgeTone> = {
    owner: "accent",
    admin: "primary",
    member: "info",
    viewer: "neutral",
};

export function Dot({color}: {color: string}) {
    return (
        <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full"
            style={{backgroundColor: color}}
        />
    );
}
