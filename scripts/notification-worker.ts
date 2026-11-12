import { loadDatabaseEnvironment } from "../src/db/env";
loadDatabaseEnvironment();
async function main() {
    const { deliverReminders } = await import(
        "../src/lib/services/notifications"
    );
    const { client } = await import("../src/db");
    let stopped = false;
    const controller = new AbortController();
    for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.on(signal, () => {
            stopped = true;
            controller.abort();
        });
    const { setTimeout } = await import("node:timers/promises");
    do {
        try {
            console.log(new Date().toISOString(), await deliverReminders());
        } catch (error) {
            console.error("Reminder delivery failed", error);
            if (process.argv.includes("--once")) throw error;
        }
        if (process.argv.includes("--once")) break;
        await setTimeout(60000, undefined, { signal: controller.signal }).catch(
            () => {},
        );
    } while (!stopped);
    client.close();
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
