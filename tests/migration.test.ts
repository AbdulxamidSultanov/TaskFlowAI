import { test } from "node:test";
import assert from "node:assert/strict";
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    copyFileSync,
    rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
test("upgrade legacy database keeps tasks, comments, tags and records date repair; repeat is safe", async () => {
    const dir = mkdtempSync(join(tmpdir(), "taskflow-upgrade-"));
    const client = createClient({ url: `file:${join(dir, "legacy.db")}` });
    try {
        const old = join(dir, "old");
        mkdirSync(join(old, "meta"), { recursive: true });
        const journal = JSON.parse(
            readFileSync("drizzle/meta/_journal.json", "utf8"),
        );
        journal.entries = journal.entries.slice(0, 2);
        writeFileSync(join(old, "meta/_journal.json"), JSON.stringify(journal));
        for (const entry of journal.entries)
            copyFileSync(
                `drizzle/${entry.tag}.sql`,
                join(old, `${entry.tag}.sql`),
            );
        await migrate(drizzle(client), { migrationsFolder: old });
        await client.batch(
            [
                "INSERT INTO departments(id,name,slug,created_at,updated_at) VALUES ('d','Dept','dept',1,1)",
                "INSERT INTO users(id,email,password_hash,name,created_at,updated_at) VALUES ('u','upgrade@example.test','test-hash','User',1,1)",
                "INSERT INTO workspaces(id,name,slug,owner_id,created_at,updated_at) VALUES ('w','Workspace','ws','u',1,1)",
                "INSERT INTO workspace_members(id,workspace_id,user_id,role,joined_at) VALUES ('m','w','u','owner',1)",
                "INSERT INTO projects(id,workspace_id,department_id,name,key,owner_id,created_at,updated_at) VALUES ('p','w','d','Project','PR','u',1,1)",
                "INSERT INTO tasks(id,workspace_id,project_id,department_id,title,creator_id,start_date,due_date,created_at,updated_at) VALUES ('t','w','p','d','Legacy task','u',2000,1000,1,1)",
                "INSERT INTO comments(id,task_id,author_id,body,created_at,updated_at) VALUES ('c','t','u','Keep this comment',1,1)",
                "INSERT INTO tags(id,workspace_id,name,created_at) VALUES ('g','w','Tag',1)",
                "INSERT INTO task_tags(id,task_id,tag_id) VALUES ('tg','t','g')",
            ],
            "write",
        );
        await client.execute(`VACUUM INTO '${join(dir, "backup.db")}'`);
        await migrate(drizzle(client), { migrationsFolder: "drizzle" });
        await migrate(drizzle(client), { migrationsFolder: "drizzle" });
        assert.equal(
            (await client.execute("select body from comments where id='c'"))
                .rows[0].body,
            "Keep this comment",
        );
        assert.equal(
            (await client.execute("select count(*) n from task_tags")).rows[0]
                .n,
            1,
        );
        assert.equal(
            (await client.execute("select start_date from tasks where id='t'"))
                .rows[0].start_date,
            1000,
        );
        assert.match(
            String(
                (
                    await client.execute(
                        "select changes from task_activity where task_id='t'",
                    )
                ).rows[0].changes,
            ),
            /2000/,
        );
        assert.equal(
            (await client.execute("pragma foreign_key_check")).rows.length,
            0,
        );
        await assert.rejects(
            client.execute("update tasks set parent_task_id='t' where id='t'"),
        );
        const backup = createClient({ url: `file:${join(dir, "backup.db")}` });
        try {
            assert.equal(
                (await backup.execute("pragma integrity_check")).rows[0]
                    .integrity_check,
                "ok",
            );
            assert.equal(
                (
                    await backup.execute(
                        "select start_date from tasks where id='t'",
                    )
                ).rows[0].start_date,
                2000,
            );
        } finally {
            backup.close();
        }
    } finally {
        client.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
