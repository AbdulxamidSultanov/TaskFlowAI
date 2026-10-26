"use client";

import type {ReactNode} from "react";

import {cn} from "@/lib/utils";

export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
                className,
            )}
        >
            <div className="min-w-0">
                {eyebrow ? (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {eyebrow}
                    </p>
                ) : null}
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-[28px]">
                    {title}
                </h1>
                {description ? (
                    <p className="mt-1 max-w-3xl text-sm text-text-secondary">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}

export function Card({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl border border-border bg-surface p-5 shadow-sm",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function CardHeader({
    title,
    description,
    action,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "mb-4 flex flex-wrap items-start justify-between gap-3",
                className,
            )}
        >
            <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-primary">
                    {title}
                </h2>
                {description ? (
                    <p className="mt-0.5 text-xs text-text-secondary">
                        {description}
                    </p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

export function StatCard({
    label,
    value,
    hint,
    icon,
    tone = "primary",
}: {
    label: ReactNode;
    value: ReactNode;
    hint?: ReactNode;
    icon?: ReactNode;
    tone?: "primary" | "success" | "warning" | "danger" | "info";
}) {
    const toneClasses = {
        primary: "bg-primary/10 text-primary",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        danger: "bg-error/10 text-error",
        info: "bg-info/10 text-info",
    }[tone];

    return (
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    {label}
                </p>
                {icon ? (
                    <span
                        className={cn(
                            "flex size-9 items-center justify-center rounded-xl",
                            toneClasses,
                        )}
                    >
                        {icon}
                    </span>
                ) : null}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
                {value}
            </p>
            {hint ? (
                <p className="mt-1 text-xs text-text-secondary">{hint}</p>
            ) : null}
        </div>
    );
}

export function ProgressBar({
    value,
    tone = "primary",
    className,
}: {
    value: number;
    tone?: "primary" | "success" | "warning" | "danger" | "info";
    className?: string;
}) {
    const clamped = Math.max(0, Math.min(100, value));
    const bar = {
        primary: "bg-primary",
        success: "bg-success",
        warning: "bg-warning",
        danger: "bg-error",
        info: "bg-info",
    }[tone];

    return (
        <div
            className={cn(
                "h-1.5 w-full overflow-hidden rounded-full bg-surface-hover",
                className,
            )}
            role="progressbar"
            aria-valuenow={Math.round(clamped)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div
                className={cn("h-full rounded-full transition-all", bar)}
                style={{width: `${clamped}%`}}
            />
        </div>
    );
}
