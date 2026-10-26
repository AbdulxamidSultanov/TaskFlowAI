import {connection} from "next/server";
import {ZodError, type ZodType} from "zod";

export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(
        status: number,
        message: string,
        code = "API_ERROR",
        details?: unknown,
    ) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function json(data: unknown, init?: ResponseInit) {
    return Response.json(data, init);
}

export function ok<T>(data: T, init?: ResponseInit) {
    return json({data}, init);
}

export function created<T>(data: T) {
    return ok(data, {status: 201});
}

export function noContent() {
    return new Response(null, {status: 204});
}

export function errorResponse(error: unknown) {
    if (error instanceof ApiError) {
        return json(
            {
                error: {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                },
            },
            {status: error.status},
        );
    }

    if (error instanceof ZodError) {
        return json(
            {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Request validation failed",
                    details: error.issues,
                },
            },
            {status: 422},
        );
    }

    const maybeSqlite = error as {code?: string; message?: string};
    if (maybeSqlite?.code?.startsWith("SQLITE_CONSTRAINT")) {
        return json(
            {
                error: {
                    code: "CONFLICT",
                    message: "A record with these unique values already exists",
                },
            },
            {status: 409},
        );
    }

    console.error("[api]", error);

    return json(
        {
            error: {
                code: "INTERNAL_ERROR",
                message:
                    process.env.NODE_ENV === "production"
                        ? "Internal server error"
                        : maybeSqlite?.message ?? "Internal server error",
            },
        },
        {status: 500},
    );
}

function isPrerenderInterruption(error: unknown) {
    if (typeof error !== "object" || error === null || !("digest" in error)) {
        return false;
    }

    const digest = (error as {digest?: unknown}).digest;
    return (
        digest === "HANGING_PROMISE_REJECTION" ||
        digest === "NEXT_PRERENDER_INTERRUPTED"
    );
}

export async function handleRoute<T>(handler: () => Promise<T>) {
    try {
        await connection();
        const result = await handler();
        if (result instanceof Response) return result;
        return ok(result);
    } catch (error) {
        if (isPrerenderInterruption(error)) throw error;
        return errorResponse(error);
    }
}

export async function parseBody<T>(
    request: Request,
    schema: ZodType<T>,
): Promise<T> {
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        throw new ApiError(400, "Request body must be valid JSON", "INVALID_JSON");
    }

    return schema.parse(body);
}

export async function parseQuery<T>(
    url: URL,
    schema: ZodType<T>,
): Promise<T> {
    const raw = Object.fromEntries(url.searchParams.entries());
    return schema.parse(raw);
}

export function requireString(value: string | null, name: string) {
    if (!value) {
        throw new ApiError(400, `Missing "${name}"`, "MISSING_PARAMETER");
    }
    return value;
}
