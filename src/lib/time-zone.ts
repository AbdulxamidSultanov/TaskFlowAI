import { ApiError } from "@/lib/api/http";
export function dateAtHour(date: string, timeZone: string, hour = 18) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match)
        throw new ApiError(422, "Invalid calendar date", "INVALID_DATE");
    const [, y, m, d] = match.map(Number);
    const utc = Date.UTC(y, m - 1, d, hour);
    if (new Date(utc).toISOString().slice(0, 10) !== date)
        throw new ApiError(422, "Invalid calendar date", "INVALID_DATE");
    let result = utc;
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
        });
        for (let i = 0; i < 3; i++) {
            const p = Object.fromEntries(
                fmt
                    .formatToParts(new Date(result))
                    .map((part) => [part.type, part.value]),
            );
            const local = Date.UTC(
                +p.year,
                +p.month - 1,
                +p.day,
                +p.hour,
                +p.minute,
                +p.second,
            );
            result += utc - local;
        }
        return new Date(result);
    } catch {
        throw new ApiError(422, "Invalid time zone", "INVALID_TIMEZONE");
    }
}

export function userDayBounds(now: Date, timeZone: string) {
    const day = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return {
        day,
        start: dateAtHour(day, timeZone, 0),
        end: dateAtHour(next.toISOString().slice(0, 10), timeZone, 0),
    };
}
