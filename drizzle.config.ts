import { defineConfig } from "drizzle-kit";
import { databaseConfig } from "./src/db/config";
import { loadDatabaseEnvironment } from "./src/db/env";
loadDatabaseEnvironment();
export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "turso",
    dbCredentials: databaseConfig(),
    verbose: true,
    strict: true,
});
