import {handleRoute, ok} from "@/lib/api/http";
import {destroySession} from "@/lib/auth/session";

export async function POST() {
    return handleRoute(async () => {
        await destroySession();
        return ok({loggedOut: true});
    });
}
