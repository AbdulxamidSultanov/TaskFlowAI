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

        // New accounts join the first workspace in the database.
        const [workspace] = await db
            .select({id: workspaces.id})
            .from(workspaces)
            .limit(1);

        if (workspace) {
            await db.insert(workspaceMembers).values({
                workspaceId: workspace.id,
                userId: user.id,
                role: "member",
            });
        }

        await createSession(user.id, request);

        return created(await getAuthUser());
    });
}
