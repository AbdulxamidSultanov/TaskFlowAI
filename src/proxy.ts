import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const SESSION_COOKIE = "taskflow_session";

export default function proxy(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
            const origin = request.headers.get("origin");
            // Next may normalize the internal URL hostname to localhost.
            // Host remains the browser's destination; do not trust forwarded host headers.
            const host = request.headers.get("host");
            const requestOrigin = host
                ? `${request.nextUrl.protocol}//${host}`
                : request.nextUrl.origin;
            const allowed = new Set([
                requestOrigin,
                ...(process.env.APP_ORIGINS ?? "").split(",").filter(Boolean),
            ]);
            if (origin && !allowed.has(origin))
                return NextResponse.json(
                    {
                        error: {
                            code: "INVALID_ORIGIN",
                            message: "Cross-origin mutation denied",
                        },
                    },
                    { status: 403 },
                );
        }
        return NextResponse.next();
    }
    // The bare domain has no locale segment. Send it straight to the auth
    // screen, or to the dashboard when a session cookie is already present.
    // The locale index page validates the session against the database, so an
    // expired cookie still ends up on the login screen.
    if (request.nextUrl.pathname === "/") {
        const target = request.cookies.has(SESSION_COOKIE)
            ? "/dashboard"
            : "/login";

        return NextResponse.redirect(
            new URL(`/${routing.defaultLocale}${target}`, request.url),
        );
    }

    return intlMiddleware(request);
}

export const config = {
    matcher: "/((?!trpc|_next|_vercel|.*\\..*).*)",
};
