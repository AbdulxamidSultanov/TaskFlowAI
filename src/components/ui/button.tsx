"use client";

import type {ButtonHTMLAttributes} from "react";

import {cn} from "@/lib/utils";

type ButtonVariant =
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger"
    | "success";

type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
};

const variants: Record<ButtonVariant, string> = {
    primary:
        "bg-primary text-white hover:bg-primary-hover shadow-sm disabled:bg-primary/60",
    secondary:
        "bg-surface-elevated text-text-primary hover:bg-surface-hover border border-border",
    outline:
        "border border-border bg-transparent text-text-primary hover:bg-surface-hover",
    ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary",
    danger: "bg-error text-white hover:opacity-90",
    success: "bg-success text-white hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
    sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
    md: "h-10 gap-2 rounded-lg px-3.5 text-sm",
    lg: "h-11 gap-2 rounded-xl px-5 text-sm",
    icon: "size-9 rounded-lg",
};

export function Button({
    className,
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    children,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            className={cn(
                "inline-flex select-none items-center justify-center font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
                variants[variant],
                sizes[size],
                className,
            )}
            {...props}
        >
            {loading ? (
                <span
                    aria-hidden
                    className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
            ) : null}
            {children}
        </button>
    );
}
