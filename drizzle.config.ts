import {existsSync} from "node:fs";
import {loadEnvFile} from "node:process";

import {defineConfig} from "drizzle-kit";

// Next.js loads .env.local automatically, but drizzle-kit runs outside Next.
if (existsSync(".env.local")) {
    loadEnvFile(".env.local");
} else if (existsSync(".env")) {
    loadEnvFile(".env");
}

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: process.env.DATABASE_PATH ?? "./.data/taskflow.db",
    },
    verbose: true,
    strict: true,
});
