// Run after npm run build. All writes and server processes use a disposable database.
import assert from "node:assert/strict";
import { mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
const dir = mkdtempSync(join(tmpdir(), "taskflow-production-"));
const env = {
    ...process.env,
    DATABASE_URL: `file:${join(dir, "test.db")}`,
    FILE_STORAGE_PATH: join(dir, "uploads"),
    AUTH_SECRET: randomBytes(32).toString("hex"),
    AI_MOCK: "1",
};
let server;
try {
    for (const file of ["scripts/migrate.ts", "src/db/seed.ts"]) {
        const result = spawnSync(
            process.execPath,
            ["node_modules/tsx/dist/cli.mjs", file],
            { env, encoding: "utf8" },
        );
        assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    const allocator = createServer();
    await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
    const port = allocator.address().port;
    await new Promise((resolve) => allocator.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const output = openSync(join(dir, "server.log"), "w");
    server = spawn(
        process.execPath,
        [
            "node_modules/tsx/dist/cli.mjs",
            "scripts/run.ts",
            "--production",
            "--port",
            String(port),
            "--hostname",
            "127.0.0.1",
        ],
        { env, stdio: ["ignore", output, output], detached: true },
    );
    let ready = false;
    for (let n = 0; n < 80; n++) {
        try {
            if ((await fetch(base + "/api/health")).ok) {
                ready = true;
                break;
            }
        } catch {}
        if (server.exitCode !== null) break;
        await delay(250);
    }
    assert.ok(
        ready,
        "Server failed to start: " +
            readFileSync(join(dir, "server.log"), "utf8"),
    );
    async function request(
        path,
        { cookie, method = "GET", body, origin = base } = {},
    ) {
        const response = await fetch(base + path, {
            method,
            headers: {
                ...(cookie ? { cookie } : {}),
                ...(body ? { "Content-Type": "application/json" } : {}),
                ...(method !== "GET" ? { origin } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = text.slice(0, 100);
        }
        return {
            status: response.status,
            data,
            cookie: response.headers.get("set-cookie")?.split(";")[0],
        };
    }
    async function login(email, password) {
        const r = await request("/api/auth/login", {
            method: "POST",
            body: { email, password },
        });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        return r.cookie;
    }
    const admin = await login("demo@taskflow.ai", "Demo1234!");
    for (const path of [
        "/api/workspaces",
        "/api/users",
        "/api/departments",
        "/api/tasks",
        "/api/projects",
        "/api/organization?workspaceId=ws-taskflow-hq",
        "/api/analytics/overview?workspaceId=ws-taskflow-hq",
        "/api/time-management?workspaceId=ws-taskflow-hq",
        "/api/auth/sessions",
    ]) {
        const r = await request(path, { cookie: admin });
        assert.equal(r.status, 200, path + JSON.stringify(r.data));
    }
    const employee = await login(
        "dilnoza.ismoilova@taskflow.ai",
        "Password123!",
    );
    assert.equal(
        (await request("/api/users", { cookie: employee })).data.data.items
            .length,
        1,
    );
    assert.equal(
        (await request("/api/tasks/task-design-1", { cookie: employee }))
            .status,
        404,
    );
    assert.equal(
        (
            await request("/api/settings", {
                cookie: employee,
                method: "PATCH",
                body: { taskReminders: false },
                origin: "https://untrusted.example",
            })
        ).status,
        403,
    );
    const created = await request("/api/tasks", {
        cookie: admin,
        method: "POST",
        body: {
            projectId: "project-engineering-1",
            title: "Production smoke task",
            assigneeId: "user-engineering-2",
            dueDate: new Date(Date.now() + 5 * 3600000).toISOString(),
        },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.data.id;
    const timer = await request("/api/time-entries", {
        cookie: employee,
        method: "POST",
        body: { taskId: id },
    });
    assert.equal(timer.status, 201, JSON.stringify(timer.data));
    const stopped = await request(`/api/time-entries/${timer.data.data.id}`, {
        cookie: employee,
        method: "PATCH",
        body: { difficulty: 4, reason: "technical", note: "Build tool issue" },
    });
    assert.equal(stopped.status, 200, JSON.stringify(stopped.data));
    const report = await request(
        "/api/time-management?workspaceId=ws-taskflow-hq",
        { cookie: admin },
    );
    assert.equal(report.data.data.entries.length, 1);
    const collaborator = await login(
        "sardor.mirzaev@taskflow.ai",
        "Password123!",
    );
    assert.equal(
        (await request(`/api/tasks/${id}`, { cookie: collaborator })).status,
        404,
    );
    const grant = await request(`/api/tasks/${id}/participants`, {
        cookie: admin,
        method: "POST",
        body: { userId: "user-design-2", role: "viewer" },
    });
    assert.equal(grant.status, 200, JSON.stringify(grant.data));
    assert.equal(
        (await request(`/api/tasks/${id}`, { cookie: collaborator })).status,
        200,
    );
    assert.equal(
        (
            await request("/api/projects/project-engineering-1", {
                cookie: collaborator,
            })
        ).status,
        404,
    );
    assert.equal(
        (
            await request(`/api/tasks/${id}`, {
                cookie: collaborator,
                method: "PATCH",
                body: { dueDate: new Date().toISOString() },
            })
        ).status,
        403,
    );
    assert.equal(
        (
            await request(`/api/tasks/${id}/participants`, {
                cookie: collaborator,
                method: "POST",
                body: { userId: "user-design-2", role: "contributor" },
            })
        ).status,
        403,
    );
    await request(`/api/tasks/${id}/participants`, {
        cookie: admin,
        method: "POST",
        body: { userId: "user-design-2", role: "contributor" },
    });
    const message = await request("/api/notifications", {
        cookie: admin,
        method: "POST",
        body: {
            userId: "user-design-2",
            entityType: "task",
            entityId: id,
            title: "Shared task action",
        },
    });
    assert.equal(message.status, 201);
    const form = new FormData();
    form.set("file", new File(["Smoke attachment"], "task.txt"));
    const upload = await fetch(base + `/api/tasks/${id}/attachments`, {
        method: "POST",
        headers: { cookie: collaborator, origin: base },
        body: form,
    });
    assert.equal(upload.status, 201);
    const fileId = (await upload.json()).data.id;
    assert.equal(
        (
            await fetch(base + `/api/attachments/${fileId}`, {
                headers: { cookie: collaborator },
            })
        ).status,
        200,
    );
    const revoke = await request(
        `/api/tasks/${id}/participants?userId=user-design-2`,
        { cookie: admin, method: "DELETE" },
    );
    assert.equal(revoke.status, 200);
    assert.equal(
        (await request(`/api/tasks/${id}`, { cookie: collaborator })).status,
        404,
    );
    assert.equal(
        (
            await fetch(base + `/api/attachments/${fileId}`, {
                headers: { cookie: collaborator },
            })
        ).status,
        404,
    );
    const inbox = await request("/api/notifications?pageSize=100", {
        cookie: collaborator,
    });
    assert.ok(!inbox.data.data.items.some((n) => n.entityId === id));
    assert.equal(
        (
            await request("/api/team-control?workspaceId=ws-taskflow-hq", {
                cookie: collaborator,
            })
        ).status,
        403,
    );
    const settings = await request("/api/settings", {
        cookie: employee,
        method: "PATCH",
        body: { reminderHours: "24,5,1", taskReminders: true },
    });
    assert.equal(settings.status, 200);
    const sessions = await request("/api/auth/sessions", { cookie: employee });
    assert.equal(sessions.data.data.length, 1);
    assert.equal(sessions.data.data[0].current, true);
    assert.ok(!("tokenHash" in sessions.data.data[0]));
    await request("/api/auth/logout", { cookie: employee, method: "POST" });
    assert.equal(
        (await request("/api/auth/me", { cookie: employee })).status,
        401,
    );
    const secondAdmin = await login("demo@taskflow.ai", "Demo1234!");
    await request("/api/auth/sessions", {
        cookie: secondAdmin,
        method: "DELETE",
    });
    assert.equal(
        (await request("/api/auth/me", { cookie: admin })).status,
        401,
    );
    const freshAdmin = await login("demo@taskflow.ai", "Demo1234!");
    const password = await request("/api/users/user-demo", {
        cookie: freshAdmin,
        method: "PATCH",
        body: { password: "Demo1234!" },
    });
    assert.equal(password.status, 200);
    assert.equal(
        (await request("/api/auth/me", { cookie: freshAdmin })).status,
        401,
    );
    // A new workspace owner can create their own department and project, never sees the demo tenant.
    const signup = await request("/api/auth/register", {
        method: "POST",
        body: {
            name: "Smoke owner",
            email: "smoke@example.test",
            password: "SmokePassword123!",
        },
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.data));
    const owner = signup.cookie;
    const ws = (await request("/api/workspaces", { cookie: owner })).data.data;
    assert.equal(ws.length, 1);
    assert.notEqual(ws[0].id, "ws-taskflow-hq");
    const department = await request("/api/departments", {
        cookie: owner,
        method: "POST",
        body: {
            workspaceId: ws[0].id,
            name: "Own department",
            slug: "smoke-department",
        },
    });
    assert.equal(department.status, 201, JSON.stringify(department.data));
    const project = await request("/api/projects", {
        cookie: owner,
        method: "POST",
        body: {
            workspaceId: ws[0].id,
            departmentId: department.data.data.id,
            name: "Own project",
            key: "SMOKE",
        },
    });
    assert.equal(project.status, 201, JSON.stringify(project.data));
    const people = (await request("/api/users", { cookie: owner })).data.data
        .items;
    assert.equal(people.length, 1);
    console.log(
        "PASS: production startup + worker, scoped APIs, timers/reasons, reminders settings, Origin, revocation, password invalidation and new-owner workflow",
    );
} finally {
    if (server?.pid) {
        try {
            process.kill(-server.pid, "SIGTERM");
        } catch {}
        await delay(500);
    }
    rmSync(dir, { recursive: true, force: true });
}
