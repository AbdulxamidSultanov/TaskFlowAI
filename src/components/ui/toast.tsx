"use client";

import {useTranslations} from "next-intl";
import {AlertCircle, CheckCircle2, Info, X} from "lucide-react";
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import {cn} from "@/lib/utils";

type ToastType = "success" | "error" | "info";

type ToastItem = {
    id: number;
    message: string;
    type: ToastType;
};

type ToastContextValue = {
    toast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({children}: {children: ReactNode}) {
    const tCommon = useTranslations("common");
    const [items, setItems] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => {
        setItems((current) => current.filter((item) => item.id !== id));
    }, []);

    const toast = useCallback(
        (message: string, type: ToastType = "info") => {
            const id = Date.now() + Math.random();
            setItems((current) => [...current.slice(-3), {id, message, type}]);
            window.setTimeout(() => dismiss(id), 4200);
        },
        [dismiss],
    );

    const value = useMemo<ToastContextValue>(
        () => ({
            toast,
            success: (message) => toast(message, "success"),
            error: (message) => toast(message, "error"),
        }),
        [toast],
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                aria-live="polite"
                className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
            >
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={cn(
                            "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3 shadow-lg",
                            item.type === "success" && "border-success/40",
                            item.type === "error" && "border-error/40",
                            item.type === "info" && "border-border",
                        )}
                    >
                        <span
                            className={cn(
                                "mt-0.5 shrink-0",
                                item.type === "success" && "text-success",
                                item.type === "error" && "text-error",
                                item.type === "info" && "text-info",
                            )}
                        >
                            {item.type === "success" ? (
                                <CheckCircle2 size={18} />
                            ) : item.type === "error" ? (
                                <AlertCircle size={18} />
                            ) : (
                                <Info size={18} />
                            )}
                        </span>
                        <p className="min-w-0 flex-1 text-sm text-text-primary">
                            {item.message}
                        </p>
                        <button
                            type="button"
                            onClick={() => dismiss(item.id)}
                            aria-label={tCommon("dismiss")}
                            className="shrink-0 rounded text-text-muted hover:text-text-primary"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used inside ToastProvider");
    }
    return context;
}
