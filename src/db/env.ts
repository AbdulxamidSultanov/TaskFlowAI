import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export function loadDatabaseEnvironment() {
    // Same precedence for CLI and Next: already injected variables win.
    if (existsSync(".env.local")) loadEnvFile(".env.local");
    if (existsSync(".env")) loadEnvFile(".env");
}
