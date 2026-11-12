import {
    createHmac,
    timingSafeEqual,
    randomUUID,
    createHash,
} from "node:crypto";

import { and, eq, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";

import { db } from "@/db";
import { departments, users, sessions } from "@/db/schema";
import type { User } from "@/db/schema";
import { ApiError } from "@/lib/api/http";

export const SESSION_COOKIE = "taskflow_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sessionSecret() {
    const secret = process.env.AUTH_SECRET;
    if (
        process.env.NODE_ENV === "production" &&
        (!secret || secret.length < 32)
    ) {
        throw new Error(
            "Production requires AUTH_SECRET with at least 32 characters",
        );
    }
    return secret ?? "taskflowai-local-development-secret";
}
const tokenHash = (token: string) =>
    createHash("sha256").update(token).digest("hex");

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
    version: number;
    nonce: string;
};

function sign(value: string) {
    return createHmac("sha256", sessionSecret())
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
            typeof payload.version !== "number" ||
            typeof payload.nonce !== "string" ||
            payload.expiresAt <= Date.now()
        ) {
            return null;
        }

        return {
            userId: payload.userId,
            expiresAt: payload.expiresAt,
            version: payload.version,
            nonce: payload.nonce,
        };
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
    const safe = { ...user } as Partial<User>;
    delete safe.passwordHash;
    return { ...safe, department } as AuthUser;
}

export async function createSession(userId: string) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const cookieStore = await cookies();
    const [user] = await db
        .select({ version: users.sessionVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user) throw new ApiError(401, "User not found", "UNAUTHORIZED");
    const token = encodeSession({
        userId,
        expiresAt: expiresAt.getTime(),
        version: user.version,
        nonce: randomUUID(),
    });
    const requestHeaders = await headers();
    await db.insert(sessions).values({
        userId,
        tokenHash: tokenHash(token),
        expiresAt,
        userAgent: requestHeaders.get("user-agent")?.slice(0, 500),
    });
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresAt,
    });

    return { expiresAt };
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
    const [stored] = await db
        .select({
            id: sessions.id,
            expiresAt: sessions.expiresAt,
            lastUsedAt: sessions.lastUsedAt,
        })
        .from(sessions)
        .where(
            and(
                eq(sessions.tokenHash, tokenHash(token)),
                eq(sessions.userId, session.userId),
            ),
        )
        .limit(1);
    if (!stored || stored.expiresAt.getTime() <= Date.now()) return null;
    const cutoff = new Date(Date.now() - 5 * 60000);
    if (stored.lastUsedAt < cutoff)
        await db
            .update(sessions)
            .set({ lastUsedAt: new Date() })
            .where(
                and(
                    eq(sessions.id, stored.id),
                    lt(sessions.lastUsedAt, cutoff),
                ),
            );

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

    if (
        !row ||
        !row.user.isActive ||
        row.user.sessionVersion !== session.version
    )
        return null;

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
    if (token)
        await db
            .delete(sessions)
            .where(eq(sessions.tokenHash, tokenHash(token)));
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

export async function currentSessionHash() {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return token ? tokenHash(token) : null;
}
