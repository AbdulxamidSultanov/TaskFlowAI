import {createHash, randomBytes} from "node:crypto";

import {and, eq, gt} from "drizzle-orm";
import {cookies} from "next/headers";
import {connection} from "next/server";

import {db} from "@/db";
import {departments, sessions, users} from "@/db/schema";
import type {User} from "@/db/schema";
import {ApiError} from "@/lib/api/http";

export const SESSION_COOKIE = "taskflow_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = Omit<User, "passwordHash"> & {
    department: {
        id: string;
        name: string;
        slug: string;
        color: string;
    } | null;
};

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function publicUser(
    user: User,
    department: {
        id: string;
        name: string;
        slug: string;
        color: string;
    } | null,
): AuthUser {
    const safe = {...user} as Partial<User>;
    delete safe.passwordHash;
    return {...safe, department} as AuthUser;
}

export async function createSession(
    userId: string,
    request?: Request,
) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.insert(sessions).values({
        userId,
        tokenHash,
        expiresAt,
        userAgent: request?.headers.get("user-agent") ?? null,
        ip:
            request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request?.headers.get("x-real-ip") ??
            null,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresAt,
    });

    return {token, expiresAt};
}

export async function getAuthUser(): Promise<AuthUser | null> {
    // Reading the session is request-specific. Awaiting `connection()` keeps the
    // surrounding layout out of the static shell so request-time values such as
    // `new Date()` (session expiry) are allowed during render.
    await connection();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const [row] = await db
        .select({
            user: users,
            department: {
                id: departments.id,
                name: departments.name,
                slug: departments.slug,
                color: departments.color,
            },
            sessionId: sessions.id,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(
            and(
                eq(sessions.tokenHash, hashToken(token)),
                gt(sessions.expiresAt, new Date()),
            ),
        )
        .limit(1);

    if (!row || !row.user.isActive) return null;

    await db
        .update(sessions)
        .set({lastUsedAt: new Date()})
        .where(eq(sessions.id, row.sessionId));

    return publicUser(row.user, row.department ?? null);
}

export async function requireUser(): Promise<AuthUser> {
    const user = await getAuthUser();
    if (!user) {
        throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
    }
    return user;
}

export async function destroySession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (token) {
        await db
            .delete(sessions)
            .where(eq(sessions.tokenHash, hashToken(token)));
    }

    cookieStore.delete(SESSION_COOKIE);
}

export function requireRole(
    user: AuthUser,
    roles: Array<"admin" | "manager" | "member">,
) {
    if (!roles.includes(user.role)) {
        throw new ApiError(403, "Insufficient permissions", "FORBIDDEN");
    }
}
