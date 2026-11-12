import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

import { databaseConfig } from "./config";
const config = databaseConfig();
if (config.url.startsWith("file:"))
    mkdirSync(dirname(config.url.slice(5)), { recursive: true });
const client = createClient(config);

export const db = drizzle(client, { schema });
export { client };
export type Db = typeof db;
