import type {FetchBaseQueryError} from "@reduxjs/toolkit/query";

export function cn(
    ...values: Array<string | false | null | undefined>
): string {
    return values.filter(Boolean).join(" ");
}

export function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

export function formatDate(
    value: string | Date | null | undefined,
    locale: string,
    options: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "short",
        year: "numeric",
    },
) {
    if (!value) return "—";

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(
    value: string | Date | null | undefined,
    locale: string,
) {
    return formatDate(value, locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatTime(
    value: string | Date | null | undefined,
    locale: string,
) {
    return formatDate(value, locale, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatRelative(
    value: string | Date | null | undefined,
    locale: string,
) {
    if (!value) return "—";

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(locale, {
        numeric: "auto",
    });
    const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ["year", 60 * 60 * 24 * 365],
        ["month", 60 * 60 * 24 * 30],
        ["week", 60 * 60 * 24 * 7],
        ["day", 60 * 60 * 24],
        ["hour", 60 * 60],
        ["minute", 60],
    ];

    for (const [unit, seconds] of ranges) {
        if (Math.abs(diffSeconds) >= seconds) {
            return formatter.format(Math.round(diffSeconds / seconds), unit);
        }
    }

    return formatter.format(diffSeconds, "second");
}

export function toDateInputValue(value: string | Date | null | undefined) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
}

export function toDateTimeLocalValue(value: string | Date | null | undefined) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

export function dateInputToIso(value: string, endOfDay = false) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;

    const date = new Date(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 9,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        0,
    );
    return date.toISOString();
}

export function dateTimeLocalToIso(value: string) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function fileSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
        units.length - 1,
        Math.floor(Math.log(bytes) / Math.log(1024)),
    );
    const value = bytes / 1024 ** index;
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
    if (!error) return fallback;

    const queryError = error as FetchBaseQueryError;
    if (queryError && typeof queryError === "object" && "data" in queryError) {
        const data = queryError.data;
        if (data && typeof data === "object" && "error" in data) {
            const apiError = (data as {error?: unknown}).error;
            if (apiError && typeof apiError === "object" && "message" in apiError) {
                return String((apiError as {message: unknown}).message);
            }
        }
    }

    if (error instanceof Error) return error.message;
    return fallback;
}

export function getApiErrorStatus(error: unknown) {
    if (!error || typeof error !== "object" || !("status" in error)) {
        return null;
    }
    const status = (error as {status?: unknown}).status;
    return typeof status === "number" ? status : null;
}

export function isToday(value: string | Date | null | undefined) {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    const now = new Date();
    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    );
}

export function isOverdue(
    dueDate: string | null | undefined,
    status: string,
) {
    if (!dueDate || status === "completed") return false;
    return new Date(dueDate).getTime() < Date.now();
}

export function startOfMonth(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function endOfMonth(value: Date) {
    return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonths(value: Date, amount: number) {
    return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

export function monthMatrix(value: Date) {
    const first = startOfMonth(value);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first grid
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);

    return Array.from({length: 42}, (_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        return day;
    });
}

export function sameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}
