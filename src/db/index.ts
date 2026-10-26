import {copyFileSync, existsSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";

import Database from "better-sqlite3";
import {drizzle} from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const bundledDatabasePath = join(process.cwd(), "data", "taskflow.db");

/**
 * Vercel only allows writes inside `/tmp`. Every function instance gets its
 * own copy of the seeded demo database, so a cold start can never crash on a
 * read-only filesystem. Local development keeps using `.data/taskflow.db`.
 */
function resolveDatabasePath() {
    if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;

    if (process.env.VERCEL) {
        const runtimePath = "/tmp/taskflow.db";
        if (!existsSync(runtimePath) && existsSync(bundledDatabasePath)) {
            copyFileSync(bundledDatabasePath, runtimePath);
        }
        return runtimePath;
    }

    return join(process.cwd(), ".data", "taskflow.db");
}

const databasePath = resolveDatabasePath();

mkdirSync(dirname(databasePath), {recursive: true});

const globalForDb = globalThis as unknown as {
    __taskflowSqlite?: Database.Database;
};

const sqlite =
    globalForDb.__taskflowSqlite ??
    new Database(databasePath, {
        fileMustExist: false,
    });

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

if (process.env.NODE_ENV !== "production") {
    globalForDb.__taskflowSqlite = sqlite;
}

export const db = drizzle(sqlite, {schema});
export {sqlite};
export type Db = typeof db;
