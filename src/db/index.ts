import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const databasePath =
    process.env.DATABASE_PATH ??
    join(process.cwd(), ".data", "taskflow.db");

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
