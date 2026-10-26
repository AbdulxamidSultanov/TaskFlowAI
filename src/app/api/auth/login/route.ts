import {eq} from "drizzle-orm";

import {db} from "@/db";
import {users} from "@/db/schema";
import {ApiError, handleRoute, ok, parseBody} from "@/lib/api/http";
import {loginSchema} from "@/lib/api/schemas";
import {verifyPassword} from "@/lib/auth/password";
import {createSession, getAuthUser} from "@/lib/auth/session";

export async function POST(request: Request) {
    return handleRoute(async () => {
        const input = await parseBody(request, loginSchema);

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, input.email))
            .limit(1);

        if (!user || !user.isActive) {
            throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
        }

        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
            throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
        }

        await createSession(user.id);

        return ok(await getAuthUser());
    });
}
