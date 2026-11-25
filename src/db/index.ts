import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

import { databaseConfig } from "./config";
const config = databaseConfig();
if (config.url.startsWith("file:"))
    mkdirSync(dirname(config.url.slice(5)), { recursive: true });
const client = createClient(config);

// The web server and the notification worker are separate processes on the
// same SQLite file. Without a busy timeout a write started by one side kills
// the other with SQLITE_BUSY the instant their transactions overlap.
if (config.url.startsWith("file:")) {
    client
        .execute("PRAGMA busy_timeout = 5000")
        .catch(() => {});
    client
        .execute("PRAGMA journal_mode = WAL")
        .catch(() => {});
}

export const db = drizzle(client, { schema });
export { client };
export type Db = typeof db;
export type DbReader = Pick<Db, "select">;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

const BUSY_PATTERN = /database is locked|database is busy|SQLITE_BUSY/i;
const RETRY_DELAYS_MS = [250, 500, 1000];

function isBusyError(error: unknown) {
    if (typeof error !== "object" || error === null) return false;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && BUSY_PATTERN.test(code)) return true;
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && BUSY_PATTERN.test(message);
}

/**
 * Runs a database operation, retrying while another process holds the write
 * lock (SQLITE_BUSY). The busy_timeout pragma already makes writers wait;
 * this covers conflicts that outlive the 5 s window, for example a large
 * "apply all" transaction overlapping several worker ticks.
 */
export async function withDbRetry<T>(
    operation: () => Promise<T>,
    label = "db operation",
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (!isBusyError(error) || attempt === RETRY_DELAYS_MS.length) {
                throw error;
            }
            lastError = error;
            if (process.env.NODE_ENV !== "production") {
                console.warn(
                    `[db] ${label} hit SQLITE_BUSY, retry ${attempt + 1}/${RETRY_DELAYS_MS.length}`,
                );
            }
            await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
            );
        }
    }
    throw lastError;
}
