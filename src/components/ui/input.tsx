"use client";

import type {
    InputHTMLAttributes,
    LabelHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
} from "react";

import {cn} from "@/lib/utils";

const fieldBase =
    "rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";

// Fields are full-width by default, but a caller-provided width utility must
// win over the default instead of relying on CSS ordering.
function hasWidth(className?: string) {
    return /(?:^|\s)w-/.test(className ?? "");
}

export function Input({
    className,
    ...props
}: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={cn(
                fieldBase,
                "h-10",
                !hasWidth(className) && "w-full",
                className,
            )}
            {...props}
        />
    );
}

export function Textarea({
    className,
    ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            className={cn(
                fieldBase,
                "min-h-24 resize-y py-2.5",
                !hasWidth(className) && "w-full",
                className,
            )}
            {...props}
        />
    );
}

export function Select({
    className,
    children,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cn(
                fieldBase,
                "h-10 cursor-pointer pr-8",
                !hasWidth(className) && "w-full",
                className,
            )}
            {...props}
        >
            {children}
        </select>
    );
}

export function Label({
    className,
    children,
    ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
    return (
        <label
            className={cn(
                "mb-1.5 block text-xs font-medium text-text-secondary",
                className,
            )}
            {...props}
        >
            {children}
        </label>
    );
}

export function Field({
    label,
    htmlFor,
    hint,
    error,
    required,
    className,
    children,
}: {
    label?: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn("min-w-0", className)}>
            {label ? (
                <Label htmlFor={htmlFor}>
                    {label}
                    {required ? (
                        <span className="ml-0.5 text-error">*</span>
                    ) : null}
                </Label>
            ) : null}
            {children}
            {error ? (
                <p className="mt-1 text-xs text-error">{error}</p>
            ) : hint ? (
                <p className="mt-1 text-xs text-text-muted">{hint}</p>
            ) : null}
        </div>
    );
}

export function Checkbox({
    label,
    description,
    className,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & {
    label: ReactNode;
    description?: ReactNode;
}) {
    return (
        <label
            className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-hover",
                className,
            )}
        >
            <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                {...props}
            />
            <span className="min-w-0">
                <span className="block text-sm font-medium text-text-primary">
                    {label}
                </span>
                {description ? (
                    <span className="mt-0.5 block text-xs text-text-secondary">
                        {description}
                    </span>
                ) : null}
            </span>
        </label>
    );
}
