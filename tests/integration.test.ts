import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import type { AuthUser } from "../src/lib/auth/session";
const dir = mkdtempSync(join(tmpdir(), "taskflow-tests-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
let database: typeof import("../src/db");
let schema: typeof import("../src/db/schema");
let taskService: typeof import("../src/lib/services/task-service");
let timeService: typeof import("../src/lib/services/time-tracking");
let notify: typeof import("../src/lib/services/notifications");
let scope: typeof import("../src/lib/auth/scope");
let ai: typeof import("../src/lib/ai/task-drafts");
let admin: AuthUser;
let manager: AuthUser;
let employee: AuthUser;
let other: AuthUser;
const workspaceId = "ws-taskflow-hq";
const projectId = "project-engineering-1";
before(async () => {
    const client = createClient({ url: process.env.DATABASE_URL! });
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    client.close();
    execFileSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "src/db/seed.ts"],
        { env: process.env, stdio: "pipe" },
    );
    database = await import("../src/db");
    schema = await import("../src/db/schema");
    taskService = await import("../src/lib/services/task-service");
    timeService = await import("../src/lib/services/time-tracking");
    notify = await import("../src/lib/services/notifications");
    scope = await import("../src/lib/auth/scope");
    ai = await import("../src/lib/ai/task-drafts");
    const people = await database.db.select().from(schema.users);
    const actor = (id: string) =>
        ({ ...people.find((u) => u.id === id)!, department: null }) as AuthUser;
    admin = actor("user-demo");
    manager = actor("user-engineering-1");
    employee = actor("user-engineering-2");
    other = actor("user-design-2");
});
after(() => {
    database?.client.close();
    rmSync(dir, { recursive: true, force: true });
});
const pagination = { page: 1, pageSize: 100, limit: 100, offset: 0 };
async function countTasks() {
    return Number(
        (await database.client.execute("select count(*) n from tasks")).rows[0]
            .n,
    );
}

test("migrations preserve seed integrity and valid date ranges", async () => {
    assert.equal(
        (await database.client.execute("pragma integrity_check")).rows[0]
            .integrity_check,
        "ok",
    );
    assert.equal(
        (await database.client.execute("pragma foreign_key_check")).rows.length,
        0,
    );
    assert.equal(
        Number(
            (
                await database.client.execute(
                    "select count(*) n from tasks where start_date>due_date",
                )
            ).rows[0].n,
        ),
        0,
    );
});
test("invalid tags roll back task creation and editing", async () => {
    const before = await countTasks();
    await assert.rejects(
        taskService.createTask(admin, {
            projectId,
            title: "Invalid create",
            tagIds: ["missing"],
        }),
        { code: "INVALID_RELATION" },
    );
    assert.equal(await countTasks(), before);
    const task = await taskService.createTask(admin, {
        projectId,
        title: "Original title",
    });
    await assert.rejects(
        taskService.updateTask(admin, task!.id, {
            title: "Wrong title",
            tagIds: ["missing"],
        }),
        { code: "INVALID_RELATION" },
    );
    assert.equal(
        (await taskService.getTaskDetail(task!.id))!.title,
        "Original title",
    );
});
test("self-parent and longer parent cycles are rejected", async () => {
    const first = await taskService.createTask(admin, {
        projectId,
        title: "First parent",
    });
    const second = await taskService.createTask(admin, {
        projectId,
        title: "Second parent",
        parentTaskId: first!.id,
    });
    await assert.rejects(
        taskService.updateTask(admin, first!.id, { parentTaskId: first!.id }),
        { code: "TASK_CYCLE" },
    );
    await assert.rejects(
        taskService.updateTask(admin, first!.id, { parentTaskId: second!.id }),
        { code: "TASK_CYCLE" },
    );
});
test("employees cannot read other teams; managers see descendants", async () => {
    const mine = await taskService.listTasks(
        employee,
        { workspaceId },
        pagination,
    );
    assert.ok(mine.items.length > 0);
    assert.ok(
        mine.items.every(
            (t) => t.assigneeId === employee.id || t.creatorId === employee.id,
        ),
    );
    const team = await taskService.listTasks(
        manager,
        { workspaceId },
        pagination,
    );
    assert.ok(team.items.length >= 5);
    assert.ok(team.items.every((t) => t.departmentId === "dept-engineering"));
    await assert.rejects(scope.requireTaskAccess(employee, "task-design-1"), {
        code: "NOT_FOUND",
    });
    await assert.rejects(
        taskService.createTask(manager, {
            projectId,
            title: "Wrong assignee",
            assigneeId: other.id,
        }),
        { code: "ASSIGNEE_FORBIDDEN" },
    );
});
test("viewer can read a scoped task but cannot write", async () => {
    await database.db
        .update(schema.workspaceMembers)
        .set({ role: "viewer" })
        .where(eq(schema.workspaceMembers.userId, employee.id));
    const mine = await taskService.listTasks(
        employee,
        { workspaceId },
        pagination,
    );
    assert.ok(mine.items.length);
    await scope.requireTaskAccess(employee, mine.items[0].id);
    await assert.rejects(
        taskService.updateTask(employee, mine.items[0].id, { title: "Denied" }),
        { code: "FORBIDDEN" },
    );
    await database.db
        .update(schema.workspaceMembers)
        .set({ role: "member" })
        .where(eq(schema.workspaceMembers.userId, employee.id));
});
test("AI publish respects draft ownership and is idempotent", async () => {
    const [draft] = await database.db
        .insert(schema.aiTaskDrafts)
        .values({
            workspaceId,
            userId: manager.id,
            batchId: "test-batch",
            projectId,
            departmentId: "dept-engineering",
            title: "AI task",
        })
        .returning();
    await assert.rejects(ai.publishDrafts(employee, workspaceId, [draft.id]), {
        code: "FORBIDDEN",
    });
    const first = await ai.publishDrafts(manager, workspaceId, [draft.id]);
    const second = await ai.publishDrafts(manager, workspaceId, [draft.id]);
    assert.deepEqual(first, second);
    assert.equal(first.length, 1);
    const [saved] = await database.db
        .select()
        .from(schema.aiTaskDrafts)
        .where(eq(schema.aiTaskDrafts.id, draft.id));
    assert.equal(saved.confirmedById, manager.id);
});
test("manual time, overlap protection, explanation and totals", async () => {
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Tracked task",
        assigneeId: employee.id,
        estimateMinutes: 30,
    });
    const startAt = new Date(Date.now() - 3 * 3600000).toISOString();
    const endAt = new Date(Date.now() - 3600000).toISOString();
    await timeService.createTimeEntry(employee, {
        taskId: task!.id,
        startAt,
        endAt,
        difficulty: 4,
        reason: "technical",
        note: "Dependency failed",
    });
    await assert.rejects(
        timeService.createTimeEntry(employee, {
            taskId: task!.id,
            startAt,
            endAt,
        }),
        { code: "TIME_OVERLAP" },
    );
    await assert.rejects(
        timeService.createTimeEntry(employee, {
            taskId: task!.id,
            difficulty: 5,
        }),
        { code: "REASON_REQUIRED" },
    );
    const report = await timeService.getTimeReport(manager, { workspaceId });
    const row = report.tasks.find((t) => t.id === task!.id)!;
    assert.equal(Math.round(row.minutes), 120);
    assert.equal(row.overrun, true);
    assert.equal(row.difficulty, 4);
    const otherReport = await timeService.getTimeReport(other, { workspaceId });
    assert.ok(!otherReport.tasks.some((t) => t.id === task!.id));
});
test("only one active timer and only its owner can stop it", async () => {
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Running task",
        assigneeId: employee.id,
    });
    const timer = await timeService.createTimeEntry(employee, {
        taskId: task!.id,
    });
    await assert.rejects(
        timeService.createTimeEntry(employee, { taskId: task!.id }),
        { code: "TIME_OVERLAP" },
    );
    await assert.rejects(timeService.stopTimeEntry(manager, timer.id, {}), {
        code: "NOT_FOUND",
    });
    const stopped = await timeService.stopTimeEntry(employee, timer.id, {
        reason: "waiting",
        difficulty: 3,
        note: "Waiting for approval",
    });
    assert.ok(stopped.endAt);
});
test("reminders at 5h, 1h and overdue do not duplicate after inbox deletion", async () => {
    const now = new Date();
    const dueDate = new Date(now.getTime() + 4.5 * 3600000).toISOString();
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Deadline task",
        assigneeId: employee.id,
        dueDate,
    });
    await notify.deliverReminders(now, employee.id);
    const first = await database.db
        .select()
        .from(schema.notifications)
        .where(
            and(
                eq(schema.notifications.entityId, task!.id),
                eq(schema.notifications.type, "task_due"),
            ),
        );
    assert.equal(first.length, 1);
    assert.match(first[0].title, /5/);
    await database.db
        .delete(schema.notifications)
        .where(eq(schema.notifications.id, first[0].id));
    await notify.deliverReminders(now, employee.id);
    assert.equal(
        (
            await database.db
                .select()
                .from(schema.notifications)
                .where(
                    and(
                        eq(schema.notifications.entityId, task!.id),
                        eq(schema.notifications.type, "task_due"),
                    ),
                )
        ).length,
        0,
    );
    await notify.deliverReminders(
        new Date(now.getTime() + 4 * 3600000),
        employee.id,
    );
    await notify.deliverReminders(
        new Date(now.getTime() + 5 * 3600000),
        employee.id,
    );
    assert.equal(
        (
            await database.db
                .select()
                .from(schema.notifications)
                .where(
                    and(
                        eq(schema.notifications.entityId, task!.id),
                        eq(schema.notifications.type, "task_due"),
                    ),
                )
        ).length,
        2,
    );
});
test("completed and archived tasks do not produce reminders", async () => {
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Closed task",
        assigneeId: employee.id,
        dueDate: new Date(Date.now() + 3600000).toISOString(),
    });
    await taskService.updateTask(manager, task!.id, { status: "completed" });
    await notify.deliverReminders(new Date(), employee.id);
    assert.equal(
        (
            await database.db
                .select()
                .from(schema.notifications)
                .where(
                    and(
                        eq(schema.notifications.entityId, task!.id),
                        eq(schema.notifications.type, "task_due"),
                    ),
                )
        ).length,
        0,
    );
    await taskService.deleteTask(manager, task!.id);
    assert.ok((await taskService.getTaskDetail(task!.id))!.archivedAt);
});
test("org cycles and cross-workspace references are rejected", async () => {
    const org = await import("../src/lib/services/organization");
    await assert.rejects(
        org.updateReportingLine(admin, workspaceId, {
            userId: manager.id,
            managerUserId: employee.id,
            accessScope: "team",
        }),
        { code: "ORG_CYCLE" },
    );
    await assert.rejects(
        org.updateReportingLine(admin, workspaceId, {
            userId: employee.id,
            managerUserId: "missing",
            accessScope: "self",
        }),
        { code: "INVALID_MANAGER" },
    );
});
test("strict calendar dates and timezones", async () => {
    const { dateAtHour } = await import("../src/lib/time-zone");
    assert.equal(
        dateAtHour("2026-11-12", "Asia/Tashkent").toISOString(),
        "2026-11-12T13:00:00.000Z",
    );
    assert.throws(() => dateAtHour("2026-02-30", "UTC"));
});

test("dependencies prevent cycles and premature completion", async () => {
    const { addDependency } = await import("../src/lib/services/task-extras");
    const a = await taskService.createTask(admin, {
        projectId,
        title: "Depends A",
    });
    const b = await taskService.createTask(admin, {
        projectId,
        title: "Depends B",
    });
    await addDependency(admin, a!.id, b!.id);
    await assert.rejects(addDependency(admin, b!.id, a!.id), {
        code: "DEPENDENCY_CYCLE",
    });
    await assert.rejects(
        taskService.updateTask(admin, a!.id, { status: "completed" }),
        { code: "TASK_BLOCKED" },
    );
    await taskService.updateTask(admin, b!.id, { status: "completed" });
    await taskService.updateTask(admin, a!.id, { status: "completed" });
});
test("invitations are email-bound, single-use and membership-idempotent", async () => {
    const { createInvitation, acceptInvitation } = await import(
        "../src/lib/services/invitations"
    );
    const invite = await createInvitation(
        admin,
        workspaceId,
        employee.email,
        "member",
    );
    await assert.rejects(acceptInvitation(other, invite.token), {
        code: "INVITATION_EMAIL_MISMATCH",
    });
    assert.equal(
        (await acceptInvitation(employee, invite.token)).workspaceId,
        workspaceId,
    );
    assert.equal(
        (await acceptInvitation(employee, invite.token)).workspaceId,
        workspaceId,
    );
});
test("attachments respect scope, bytes, quota and deletion", async () => {
    process.env.FILE_STORAGE_PATH = join(dir, "uploads");
    const { uploadAttachment, downloadAttachment, deleteAttachment } =
        await import("../src/lib/services/attachments");
    const task = await taskService.createTask(manager, {
        projectId,
        title: "File task",
        assigneeId: employee.id,
    });
    const file = await uploadAttachment(
        employee,
        task!.id,
        new File(["test content"], "notes.txt"),
    );
    assert.equal(
        (await downloadAttachment(employee, file.id)).data.toString(),
        "test content",
    );
    await assert.rejects(downloadAttachment(other, file.id), {
        code: "NOT_FOUND",
    });
    await deleteAttachment(employee, file.id);
    await assert.rejects(downloadAttachment(employee, file.id), {
        code: "NOT_FOUND",
    });
});
test("reminders can be disabled and do not leak to other users", async () => {
    const task = await taskService.createTask(manager, {
        projectId,
        title: "No reminder task",
        assigneeId: employee.id,
        dueDate: new Date(Date.now() + 3600000).toISOString(),
    });
    await database.db
        .update(schema.userSettings)
        .set({ taskReminders: false })
        .where(eq(schema.userSettings.userId, employee.id));
    await notify.deliverReminders(new Date(), employee.id);
    assert.equal(
        (
            await database.db
                .select()
                .from(schema.notifications)
                .where(
                    and(
                        eq(schema.notifications.entityId, task!.id),
                        eq(schema.notifications.type, "task_due"),
                    ),
                )
        ).length,
        0,
    );
    await database.db
        .update(schema.userSettings)
        .set({ taskReminders: true })
        .where(eq(schema.userSettings.userId, employee.id));
});

test("AI generation uses scoped context, strict batch quota and duplicate protection", async () => {
    process.env.AI_MOCK = "1";
    const result = await ai.generateDrafts(manager, {
        workspaceId,
        projectId,
        prompt: "Создай 1 задачу: проверить интеграционный сценарий аудита",
    });
    assert.equal(result.mode, "mock");
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].departmentId, "dept-engineering");
    await assert.rejects(
        ai.generateDrafts(manager, {
            workspaceId,
            projectId,
            prompt: "Создай 1 задачу: проверить интеграционный сценарий аудита",
        }),
        { code: "NO_NEW_TASKS" },
    );
    await database.db.insert(schema.aiTaskDrafts).values(
        Array.from({ length: 29 }, (_, i) => ({
            workspaceId,
            userId: manager.id,
            batchId: "quota",
            title: `Quota ${i}`,
            projectId,
        })),
    );
    await assert.rejects(
        ai.generateDrafts(manager, {
            workspaceId,
            projectId,
            prompt: "Создай 1 задачу: новая проверка квоты",
        }),
        { code: "RATE_LIMITED" },
    );
});
test("planner respects profile timezone, personal calendar and atomic saved blocks", async () => {
    const { generatePlan } = await import("../src/lib/ai/planner");
    const { dateAtHour } = await import("../src/lib/time-zone");
    await database.db.insert(schema.calendarEvents).values({
        workspaceId,
        createdById: employee.id,
        title: "Personal busy time",
        startAt: dateAtHour("2030-06-03", employee.timezone, 9),
        endAt: dateAtHour("2030-06-03", employee.timezone, 11),
    });
    const plan = await generatePlan({
        userId: employee.id,
        workspaceId,
        date: "2030-06-03T06:00:00Z",
        availableMinutes: 120,
    });
    assert.ok(plan);
    assert.equal(
        plan.date.toISOString(),
        dateAtHour("2030-06-03", employee.timezone, 9).toISOString(),
    );
    assert.ok(
        plan.items.every(
            (item) =>
                item.startAt >= dateAtHour("2030-06-03", employee.timezone, 11),
        ),
    );
    assert.ok(plan.items.every((item) => item.task?.status !== "blocked"));
});

test("provider suggestions enforce real dates, 21-day window and project department", async () => {
    const { normalizeSuggestion } = await import(
        "../src/lib/ai/task-generator"
    );
    const context = {
        workspaceId,
        userId: manager.id,
        prompt: "test",
        today: "2026-11-12",
        timezone: "Asia/Tashkent",
        projects: [
            {
                id: projectId,
                name: "Project",
                key: "PR",
                departmentId: "dept-engineering",
            },
        ],
        departments: [{ id: "dept-design", name: "Design" }],
        members: [],
    };
    const item = {
        title: "Valid task",
        description: "Check",
        priority: "medium" as const,
        suggestedDeadline: "2026-11-13",
        suggestedAssigneeId: null,
        departmentId: "dept-design",
        projectId,
        estimateMinutes: 30,
    };
    const normalized = normalizeSuggestion(item, context)!;
    assert.equal(normalized.departmentId, "dept-engineering");
    assert.equal(
        normalized.suggestedDeadline?.toISOString(),
        "2026-11-13T13:00:00.000Z",
    );
    assert.equal(
        normalizeSuggestion(
            { ...item, suggestedDeadline: "2027-01-01" },
            context,
        )!.suggestedDeadline,
        null,
    );
    assert.equal(
        normalizeSuggestion(
            { ...item, suggestedDeadline: "2026-11-31" },
            context,
        )!.suggestedDeadline,
        null,
    );
});

test("task collaboration grants only one task and separates view from actions", async () => {
    const { setTaskParticipant } = await import(
        "../src/lib/services/task-participants"
    );
    const { requireTaskPermission } = await import(
        "../src/lib/auth/task-rights"
    );
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Cross-department collaboration",
        assigneeId: employee.id,
    });
    const sibling = await taskService.createTask(manager, {
        projectId,
        title: "Private sibling",
        assigneeId: employee.id,
    });
    await assert.rejects(scope.requireTaskAccess(other, task!.id), {
        code: "NOT_FOUND",
    });
    await assert.rejects(
        setTaskParticipant(other, task!.id, other.id, "contributor"),
        { code: "NOT_FOUND" },
    );
    await setTaskParticipant(manager, task!.id, other.id, "viewer");
    await scope.requireTaskAccess(other, task!.id);
    await assert.rejects(scope.requireTaskAccess(other, sibling!.id), {
        code: "NOT_FOUND",
    });
    await assert.rejects(scope.requireProjectAccess(other, projectId), {
        code: "NOT_FOUND",
    });
    await assert.rejects(requireTaskPermission(other, task!.id, "comment"), {
        code: "FORBIDDEN",
    });
    await setTaskParticipant(manager, task!.id, other.id, "contributor");
    await taskService.addComment(other, task!.id, "Task-only contribution");
    await assert.rejects(
        taskService.updateTask(other, task!.id, {
            dueDate: new Date(Date.now() + 3600000).toISOString(),
        }),
        { code: "FORBIDDEN" },
    );
    await assert.rejects(
        taskService.updateTask(other, task!.id, { assigneeId: other.id }),
        { code: "FORBIDDEN" },
    );
    await assert.rejects(taskService.deleteTask(other, task!.id), {
        code: "FORBIDDEN",
    });
    await assert.rejects(
        setTaskParticipant(other, task!.id, other.id, "contributor"),
        { code: "FORBIDDEN" },
    );
    const listed = await taskService.listTasks(
        other,
        { workspaceId, search: "Cross-department collaboration" },
        pagination,
    );
    assert.equal(listed.pagination.total, 1);
    await setTaskParticipant(manager, task!.id, other.id, null);
    await assert.rejects(scope.requireTaskAccess(other, task!.id), {
        code: "NOT_FOUND",
    });
    assert.equal(
        (
            await taskService.listTasks(
                other,
                { workspaceId, search: "Cross-department collaboration" },
                pagination,
            )
        ).pagination.total,
        0,
    );
    await setTaskParticipant(manager, task!.id, employee.id, "contributor");
    await setTaskParticipant(manager, task!.id, employee.id, null);
    await scope.requireTaskAccess(employee, task!.id);
});
test("review distinguishes submission, mandatory rework comment and acceptance", async () => {
    const { applyTaskWorkflow } = await import(
        "../src/lib/services/task-workflow"
    );
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Reviewable result",
        assigneeId: employee.id,
        requiresReview: true,
    });
    await taskService.updateTask(employee, task!.id, { status: "completed" });
    let saved = await taskService.getTaskDetail(task!.id, employee);
    assert.equal(saved!.status, "under_review");
    assert.equal(saved!.completedAt, null);
    assert.ok(saved!.submittedAt);
    await assert.rejects(
        applyTaskWorkflow(employee, task!.id, { action: "accept" }),
        { code: "FORBIDDEN" },
    );
    await assert.rejects(
        applyTaskWorkflow(manager, task!.id, { action: "rework", reason: " " }),
        { code: "REASON_REQUIRED" },
    );
    await applyTaskWorkflow(manager, task!.id, {
        action: "rework",
        reason: "Add the missing acceptance criteria",
    });
    saved = await taskService.getTaskDetail(task!.id, employee);
    assert.equal(saved!.status, "in_progress");
    assert.ok(
        saved!.comments.some((c) => c.body.includes("acceptance criteria")),
    );
    await applyTaskWorkflow(employee, task!.id, { action: "submit" });
    await applyTaskWorkflow(manager, task!.id, { action: "accept" });
    saved = await taskService.getTaskDetail(task!.id, employee);
    assert.equal(saved!.status, "completed");
    assert.equal(saved!.reviewedById, manager.id);
    assert.ok(saved!.completedAt);
});
test("review permissions cannot survive a contributor downgrade or bypass pending review", async () => {
    const { applyTaskWorkflow } = await import(
        "../src/lib/services/task-workflow"
    );
    const { setTaskParticipant } = await import(
        "../src/lib/services/task-participants"
    );
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Explicit reviewer access",
        assigneeId: employee.id,
    });
    await setTaskParticipant(manager, task!.id, other.id, "contributor");
    await taskService.updateTask(manager, task!.id, {
        reviewerId: other.id,
        requiresReview: true,
    });
    await applyTaskWorkflow(employee, task!.id, { action: "submit" });
    await assert.rejects(
        taskService.updateTask(manager, task!.id, { reviewerId: manager.id }),
        { code: "REVIEW_PENDING" },
    );
    await setTaskParticipant(manager, task!.id, other.id, "viewer");
    await scope.requireTaskAccess(other, task!.id);
    await assert.rejects(
        applyTaskWorkflow(other, task!.id, { action: "accept" }),
        { code: "FORBIDDEN" },
    );
    await applyTaskWorkflow(manager, task!.id, {
        action: "rework",
        reason: "Please update the result",
    });
    const fresh = await taskService.createTask(manager, {
        projectId,
        title: "No completion bypass",
        assigneeId: employee.id,
    });
    await assert.rejects(
        taskService.updateTask(manager, fresh!.id, {
            requiresReview: true,
            status: "completed",
        }),
        { code: "WORKFLOW_ACTION_REQUIRED" },
    );
});
test("block helper needs prior access; worker notifies once and revocation hides notifications", async () => {
    const { setTaskParticipant } = await import(
        "../src/lib/services/task-participants"
    );
    const { applyTaskWorkflow } = await import(
        "../src/lib/services/task-workflow"
    );
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Blocked cross-department task",
        assigneeId: employee.id,
    });
    await assert.rejects(
        applyTaskWorkflow(employee, task!.id, {
            action: "block",
            reason: "Need a design decision",
            targetUserId: other.id,
        }),
        { code: "NOT_FOUND" },
    );
    await setTaskParticipant(manager, task!.id, other.id, "contributor");
    await applyTaskWorkflow(employee, task!.id, {
        action: "block",
        reason: "Need a design decision",
        targetUserId: other.id,
    });
    await notify.deliverReminders(new Date(), other.id);
    await notify.deliverReminders(new Date(), other.id);
    let rows = await database.db
        .select()
        .from(schema.notifications)
        .where(
            and(
                eq(schema.notifications.entityId, task!.id),
                eq(schema.notifications.userId, other.id),
            ),
        );
    assert.equal(rows.length, 1);
    assert.match(rows[0].body!, /design decision/);
    await setTaskParticipant(manager, task!.id, other.id, null);
    rows = await database.db
        .select()
        .from(schema.notifications)
        .where(
            and(
                eq(schema.notifications.entityId, task!.id),
                await notify.notificationScope(other),
            ),
        );
    assert.equal(rows.length, 0);
    await assert.rejects(
        applyTaskWorkflow(other, task!.id, { action: "unblock" }),
        { code: "NOT_FOUND" },
    );
    await applyTaskWorkflow(manager, task!.id, { action: "unblock" });
    const saved = await taskService.getTaskDetail(task!.id, employee);
    assert.equal(saved!.blockReason, null);
    assert.equal(saved!.status, "in_progress");
});
test("my day honors timezone, unique overlapping groups, action requests and closed tasks", async () => {
    const { getDayBoard } = await import("../src/lib/services/day-board");
    const { applyTaskWorkflow } = await import(
        "../src/lib/services/task-workflow"
    );
    const actor = { ...employee, timezone: "America/Bogota" };
    const now = new Date("2031-03-05T02:00:00Z"); // Local date is March 4.
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Local-day overlap",
        assigneeId: employee.id,
        dueDate: "2031-03-04T22:00:00Z",
    });
    const closed = await taskService.createTask(manager, {
        projectId,
        title: "Cancelled deadline",
        assigneeId: employee.id,
        dueDate: "2031-03-04T22:00:00Z",
    });
    await applyTaskWorkflow(manager, closed!.id, { action: "cancel" });
    const result = await getDayBoard(actor, { workspaceId }, false, now);
    assert.equal(result.day, "2031-03-04");
    assert.ok(result.groups.today!.some((t) => t.id === task!.id));
    assert.ok(result.groups.overdue.some((t) => t.id === task!.id));
    assert.ok(
        !Object.values(result.groups)
            .flat()
            .some((t) => t.id === closed!.id),
    );
    const unique = new Set(
        Object.values(result.groups)
            .flat()
            .map((t) => t.id),
    );
    assert.equal(result.uniqueCount, unique.size);
    const visible = await getDayBoard(other, { workspaceId }, false, now);
    assert.ok(
        !Object.values(visible.groups)
            .flat()
            .some((t) => t.id === task!.id),
    );
    const team = await getDayBoard(manager, { workspaceId }, true, now);
    assert.ok(
        Object.values(team.groups)
            .flat()
            .every((t) => t.departmentId === "dept-engineering"),
    );
    await assert.rejects(getDayBoard(employee, { workspaceId }, true, now), {
        code: "FORBIDDEN",
    });
});

test("a contributor can log time and attach files, but revocation stops a running timer", async () => {
    const { setTaskParticipant } = await import(
        "../src/lib/services/task-participants"
    );
    const { uploadAttachment, downloadAttachment } = await import(
        "../src/lib/services/attachments"
    );
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Contributor work",
        assigneeId: employee.id,
    });
    await setTaskParticipant(manager, task!.id, other.id, "contributor");
    const entry = await timeService.createTimeEntry(other, {
        taskId: task!.id,
    });
    const file = await uploadAttachment(
        other,
        task!.id,
        new File(["Shared file"], "shared.txt"),
    );
    assert.equal(
        (await downloadAttachment(other, file.id)).data.toString(),
        "Shared file",
    );
    await setTaskParticipant(manager, task!.id, other.id, null);
    const [stopped] = await database.db
        .select()
        .from(schema.timeEntries)
        .where(eq(schema.timeEntries.id, entry.id));
    assert.ok(stopped.endAt);
    await assert.rejects(downloadAttachment(other, file.id), {
        code: "NOT_FOUND",
    });
    await assert.rejects(
        taskService.addComment(other, task!.id, "No longer authorized"),
        { code: "NOT_FOUND" },
    );
});
test("an explicit response request appears in my day and requires an actual response", async () => {
    const { getDayBoard } = await import("../src/lib/services/day-board");
    const { applyTaskWorkflow } = await import(
        "../src/lib/services/task-workflow"
    );
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Response needed",
        assigneeId: employee.id,
    });
    await applyTaskWorkflow(manager, task!.id, {
        action: "request",
        targetUserId: employee.id,
        reason: "Please confirm the acceptance criteria",
    });
    const board = await getDayBoard(employee, { workspaceId });
    const card = board.groups.action!.find((t) => t.id === task!.id)!;
    assert.ok(card);
    assert.equal(card.actions[0].kind, "response");
    assert.match(card.actions[0].reason, /acceptance criteria/);
    await assert.rejects(
        applyTaskWorkflow(employee, task!.id, {
            action: "resolve",
            requestId: card.actions[0].id,
            reason: " ",
        }),
        { code: "REASON_REQUIRED" },
    );
    await applyTaskWorkflow(employee, task!.id, {
        action: "resolve",
        requestId: card.actions[0].id,
        reason: "Criteria confirmed",
    });
    assert.ok(
        !(await getDayBoard(employee, { workspaceId })).groups.action!.some(
            (t) => t.id === task!.id,
        ),
    );
});
test("nested reporting teams are visible, neighboring teams and leadership remain hidden", async () => {
    const { updateReportingLine } = await import(
        "../src/lib/services/organization"
    );
    await updateReportingLine(admin, workspaceId, {
        userId: "user-design-1",
        managerUserId: manager.id,
        accessScope: "team",
    });
    await scope.requireTaskAccess(manager, "task-design-1");
    await assert.rejects(scope.requireTaskAccess(manager, "task-marketing-1"), {
        code: "NOT_FOUND",
    });
    const leadership = await taskService.createTask(admin, {
        projectId,
        title: "Leadership only",
        assigneeId: admin.id,
    });
    await assert.rejects(scope.requireTaskAccess(manager, leadership!.id), {
        code: "NOT_FOUND",
    });
    await updateReportingLine(admin, workspaceId, {
        userId: "user-design-1",
        managerUserId: admin.id,
        accessScope: "team",
    });
    await assert.rejects(scope.requireTaskAccess(manager, "task-design-1"), {
        code: "NOT_FOUND",
    });
});
test("changing the deadline replaces pending reminders; cancelled tasks stop the plan", async () => {
    const task = await taskService.createTask(manager, {
        projectId,
        title: "Rescheduled reminder",
        assigneeId: employee.id,
        dueDate: new Date(Date.now() + 4 * 3600000).toISOString(),
    });
    await notify.deliverReminders(new Date(), employee.id);
    const pending = () =>
        database.db
            .select()
            .from(schema.notifications)
            .where(
                and(
                    eq(schema.notifications.entityId, task!.id),
                    eq(schema.notifications.type, "task_due"),
                ),
            );
    assert.equal((await pending()).length, 1);
    await taskService.updateTask(manager, task!.id, {
        dueDate: new Date(Date.now() + 72 * 3600000).toISOString(),
    });
    assert.equal((await pending()).length, 0);
    await notify.deliverReminders(new Date(), employee.id);
    assert.equal((await pending()).length, 0);
    await taskService.updateTask(manager, task!.id, { status: "cancelled" });
    await notify.deliverReminders(
        new Date(Date.now() + 73 * 3600000),
        employee.id,
    );
    assert.equal((await pending()).length, 0);
});
