"use client";

import {Inbox, Loader2, RotateCcw} from "lucide-react";
import type {ReactNode} from "react";

import {cn} from "@/lib/utils";

export function Spinner({className}: {className?: string}) {
    return (
        <Loader2
            className={cn("size-5 animate-spin text-primary", className)}
            aria-hidden
        />
    );
}

export function PageLoader({label}: {label?: string}) {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-text-secondary">
            <Spinner className="size-7" />
            {label ? <p className="text-sm">{label}</p> : null}
        </div>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    className,
}: {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-14 text-center",
                className,
            )}
        >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-elevated text-text-muted">
                {icon ?? <Inbox size={22} />}
            </span>
            <div>
                <h3 className="text-sm font-semibold text-text-primary">
                    {title}
                </h3>
                {description ? (
                    <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">
                        {description}
                    </p>
                ) : null}
            </div>
            {action}
        </div>
    );
}

export function ErrorState({
    title,
    description,
    retryLabel,
    onRetry,
}: {
    title: ReactNode;
    description?: ReactNode;
    retryLabel: string;
    onRetry?: () => void;
}) {
    return (
        <EmptyState
            icon={<RotateCcw size={22} />}
            title={title}
            description={description}
            action={
                onRetry ? (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
                    >
                        {retryLabel}
                    </button>
                ) : null
            }
        />
    );
}

export function Skeleton({className}: {className?: string}) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-lg bg-surface-hover",
                className,
            )}
        />
    );
}

export function ListSkeleton({rows = 6}: {rows?: number}) {
    return (
        <div className="space-y-2">
            {Array.from({length: rows}, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
            ))}
        </div>
    );
}
