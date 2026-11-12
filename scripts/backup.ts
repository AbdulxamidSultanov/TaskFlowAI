import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { databaseConfig } from "../src/db/config";
import { loadDatabaseEnvironment } from "../src/db/env";
loadDatabaseEnvironment();
export async function backupDatabase() {
    const config = databaseConfig();
    if (!config.url.startsWith("file:")) {
        console.log(
            "Remote database: take a provider snapshot before production migrations.",
        );
        return;
    }
    mkdirSync(".data/backups", { recursive: true });
    const path = resolve(`.data/backups/taskflow-${Date.now()}.db`);
    const client = createClient(config);
    try {
        await client.execute(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
        const backup = createClient({ url: `file:${path}` });
        try {
            const result = await backup.execute("PRAGMA integrity_check");
            if (result.rows[0]?.integrity_check !== "ok")
                throw new Error("Backup integrity check failed");
        } finally {
            backup.close();
        }
        console.log("Verified backup:", path);
    } finally {
        client.close();
    }
}
if (process.argv[1]?.endsWith("backup.ts"))
    backupDatabase().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
