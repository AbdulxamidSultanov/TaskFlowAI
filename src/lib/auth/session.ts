import {createHmac, timingSafeEqual} from "node:crypto";

import {eq} from "drizzle-orm";
import {cookies} from "next/headers";
import {connection} from "next/server";

import {db} from "@/db";
import {departments, users} from "@/db/schema";
import type {User} from "@/db/schema";
import {ApiError} from "@/lib/api/http";

export const SESSION_COOKIE = "taskflow_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Sessions are signed cookies instead of database rows. On Vercel every
 * serverless function instance has its own ephemeral SQLite copy, so a session
 * written by the login API would otherwise be invisible to the page renderer.
 */
const SESSION_SECRET =
    process.env.AUTH_SECRET ?? "taskflowai-local-development-secret";

export type AuthUser = Omit<User, "passwordHash"> & {
    department: {
        id: string;
        name: string;
        slug: string;
        color: string;
    } | null;
};

type SessionPayload = {
    userId: string;
    expiresAt: number;
};

function sign(value: string) {
    return createHmac("sha256", SESSION_SECRET)
        .update(value)
        .digest("base64url");
}

function encodeSession(payload: SessionPayload) {
    const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${value}.${sign(value)}`;
}

function decodeSession(token: string): SessionPayload | null {
    const [value, signature] = token.split(".");
    if (!value || !signature) return null;

    const expected = sign(value);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
        actualBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer.from(value, "base64url").toString("utf8"),
        ) as Partial<SessionPayload>;

        if (
            typeof payload.userId !== "string" ||
            typeof payload.expiresAt !== "number" ||
            payload.expiresAt <= Date.now()
        ) {
            return null;
        }

        return {userId: payload.userId, expiresAt: payload.expiresAt};
    } catch {
        return null;
    }
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

export async function createSession(userId: string) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const cookieStore = await cookies();

    cookieStore.set(
        SESSION_COOKIE,
        encodeSession({userId, expiresAt: expiresAt.getTime()}),
        {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            expires: expiresAt,
        },
    );

    return {expiresAt};
}

export async function getAuthUser(): Promise<AuthUser | null> {
    // Reading the session is request-specific. Awaiting `connection()` keeps the
    // surrounding layout out of the static shell so request-time values such as
    // the session expiry are allowed during render.
    await connection();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const session = decodeSession(token);
    if (!session) return null;

    const [row] = await db
        .select({
            user: users,
            department: {
                id: departments.id,
                name: departments.name,
                slug: departments.slug,
                color: departments.color,
            },
        })
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(eq(users.id, session.userId))
        .limit(1);

    if (!row || !row.user.isActive) return null;

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
