"use client";

import type {ReactNode} from "react";

import {cn} from "@/lib/utils";

export function Tabs<T extends string>({
    value,
    onChange,
    items,
    className,
}: {
    value: T;
    onChange: (value: T) => void;
    items: Array<{value: T; label: ReactNode; count?: number}>;
    className?: string;
}) {
    return (
        <div
            role="tablist"
            className={cn(
                "flex w-full min-w-0 gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1",
                className,
            )}
        >
            {items.map((item) => {
                const active = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(item.value)}
                        className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                            active
                                ? "bg-primary text-white shadow-sm"
                                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                        )}
                    >
                        {item.label}
                        {typeof item.count === "number" ? (
                            <span
                                className={cn(
                                    "rounded-full px-1.5 text-[10px] tabular-nums",
                                    active
                                        ? "bg-white/20"
                                        : "bg-surface-hover text-text-muted",
                                )}
                            >
                                {item.count}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

export function SegmentedControl<T extends string>({
    value,
    onChange,
    items,
    className,
}: {
    value: T;
    onChange: (value: T) => void;
    items: Array<{value: T; label: ReactNode; icon?: ReactNode}>;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 rounded-lg border border-border bg-surface-elevated p-1",
                className,
            )}
        >
            {items.map((item) => {
                const active = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(item.value)}
                        className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                            active
                                ? "bg-surface text-text-primary shadow-sm"
                                : "text-text-muted hover:text-text-primary",
                        )}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
