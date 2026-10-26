import {eq} from "drizzle-orm";

import {db} from "@/db";
import {
    departments,
    userSettings,
    users,
    workspaceMembers,
    workspaces,
} from "@/db/schema";
import {ApiError, created, handleRoute, parseBody} from "@/lib/api/http";
import {registerSchema} from "@/lib/api/schemas";
import {hashPassword} from "@/lib/auth/password";
import {createSession, getAuthUser} from "@/lib/auth/session";

export async function POST(request: Request) {
    return handleRoute(async () => {
        const input = await parseBody(request, registerSchema);

        const [existing] = await db
            .select({id: users.id})
            .from(users)
            .where(eq(users.email, input.email))
            .limit(1);

        if (existing) {
            throw new ApiError(
                409,
                "A user with this email already exists",
                "EMAIL_TAKEN",
            );
        }

        if (input.departmentId) {
            const [department] = await db
                .select({id: departments.id})
                .from(departments)
                .where(eq(departments.id, input.departmentId))
                .limit(1);

            if (!department) {
                throw new ApiError(404, "Department not found", "NOT_FOUND");
            }
        }

        const [user] = await db
            .insert(users)
            .values({
                name: input.name,
                email: input.email,
                passwordHash: await hashPassword(input.password),
                departmentId: input.departmentId ?? null,
            })
            .returning({id: users.id});

        await db.insert(userSettings).values({userId: user.id});

        // Every new account starts in its own workspace. Previously sign-ups
        // were attached to the first workspace in the database (usually the
        // demo one), which leaked demo projects and people into fresh
        // accounts. An administrator can still invite the user to a shared
        // workspace afterwards.
        const slugBase =
            input.name
                .normalize("NFKD")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 40) || "workspace";
        const workspaceName = `${input.name.trim()} workspace`.slice(0, 100);

        const [workspace] = await db
            .insert(workspaces)
            .values({
                name: workspaceName,
                slug: `${slugBase}-${user.id.slice(0, 8)}`,
                ownerId: user.id,
            })
            .returning({id: workspaces.id});

        await db.insert(workspaceMembers).values({
            workspaceId: workspace.id,
            userId: user.id,
            role: "owner",
        });

        await createSession(user.id, request);

        return created(await getAuthUser());
    });
}
