import { spawn } from "node:child_process";
import { loadDatabaseEnvironment } from "../src/db/env";
loadDatabaseEnvironment();
const production = process.argv.includes("--production");
if (
    production &&
    (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
)
    throw new Error(
        "Set AUTH_SECRET (at least 32 characters) before starting production",
    );
const args = process.argv.slice(2).filter((a) => a !== "--production");
const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: production ? "production" : "development",
};
const web = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", production ? "start" : "dev", ...args],
    { stdio: "inherit", env },
);
const worker = spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/notification-worker.ts"],
    { stdio: "inherit", env },
);
let closing = false;
function close(code = 0) {
    if (closing) return;
    closing = true;
    web.kill("SIGTERM");
    worker.kill("SIGTERM");
    process.exitCode = code;
}
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
web.on("exit", (code) => close(code ?? 1));
worker.on("exit", (code) => close(code ?? 1));
for (const child of [web, worker])
    child.on("error", (error) => {
        console.error(error);
        close(1);
    });
