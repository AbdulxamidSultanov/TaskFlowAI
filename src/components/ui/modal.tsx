"use client";

import {X} from "lucide-react";
import {useTranslations} from "next-intl";
import type {ReactNode} from "react";
import {useEffect, useId, useRef} from "react";

import {cn} from "@/lib/utils";

export function Modal({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = "md",
    closeLabel,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    size?: "sm" | "md" | "lg" | "xl";
    closeLabel?: string;
}) {
    const tCommon = useTranslations("common");
    const resolvedCloseLabel = closeLabel ?? tCommon("close");
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        panelRef.current?.focus();

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const width = {
        sm: "max-w-md",
        md: "max-w-xl",
        lg: "max-w-3xl",
        xl: "max-w-5xl",
    }[size];

    return (
        <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={cn(
                    "flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl outline-none sm:rounded-2xl",
                    width,
                )}
            >
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h2
                            id={titleId}
                            className="truncate text-base font-semibold text-text-primary"
                        >
                            {title}
                        </h2>
                        {description ? (
                            <p className="mt-1 text-sm text-text-secondary">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={resolvedCloseLabel}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {children}
                </div>

                {footer ? (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    danger = true,
    loading = false,
    onConfirm,
    onClose,
}: {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    confirmLabel: ReactNode;
    cancelLabel: ReactNode;
    danger?: boolean;
    loading?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-lg border border-border px-3 text-sm text-text-primary hover:bg-surface-hover"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={cn(
                            "h-9 rounded-lg px-3 text-sm font-medium text-white disabled:opacity-60",
                            danger ? "bg-error" : "bg-primary",
                        )}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p className="text-sm text-text-secondary">{description}</p>
        </Modal>
    );
}
