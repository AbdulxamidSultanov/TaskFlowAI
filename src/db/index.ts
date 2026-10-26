import {mkdirSync} from "node:fs";
import {dirname, join} from "node:path";

import {createClient} from "@libsql/client";
import {drizzle} from "drizzle-orm/libsql";

import * as schema from "./schema";

/**
 * Production uses a remote Turso database so every Vercel serverless function
 * sees the same data. Local development falls back to a SQLite file.
 */
function resolveDatabaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

    const localPath = join(process.cwd(), ".data", "taskflow.db");
    mkdirSync(dirname(localPath), {recursive: true});
    return `file:${localPath}`;
}

const client = createClient({
    url: resolveDatabaseUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, {schema});
export {client};
export type Db = typeof db;
