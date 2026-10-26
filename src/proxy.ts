import createMiddleware from "next-intl/middleware";
import {NextResponse, type NextRequest} from "next/server";

import {routing} from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const SESSION_COOKIE = "taskflow_session";

export default function proxy(request: NextRequest) {
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
    matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
