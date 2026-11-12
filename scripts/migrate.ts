import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { databaseConfig } from "../src/db/config";
import { loadDatabaseEnvironment } from "../src/db/env";
import { backupDatabase } from "./backup";
loadDatabaseEnvironment();
async function main() {
    const config = databaseConfig();
    if (config.url.startsWith("file:")) {
        const path = config.url.slice(5);
        mkdirSync(dirname(path), { recursive: true });
        if (existsSync(path)) await backupDatabase();
    } else if (process.env.CONFIRM_REMOTE_MIGRATION !== "1") {
        throw new Error(
            "Remote migration requires a provider backup and CONFIRM_REMOTE_MIGRATION=1",
        );
    }
    const client = createClient(config);
    try {
        await migrate(drizzle(client), { migrationsFolder: "drizzle" });
        console.log(
            "Migrations applied; database:",
            config.url.startsWith("file:") ? "local" : "remote",
        );
    } finally {
        client.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
