import { resolve } from "node:path";

export function databaseConfig() {
    const url =
        process.env.DATABASE_URL ||
        (process.env.DATABASE_PATH
            ? `file:${resolve(process.env.DATABASE_PATH)}`
            : `file:${resolve(".data/taskflow.db")}`);
    return { url, authToken: process.env.DATABASE_AUTH_TOKEN };
}
