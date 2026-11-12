"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useDayBoardQuery } from "@/lib/redux/workflow-api";
import { useGetWorkspaceMembersQuery } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { TaskActions } from "./task-actions";
export function DayBoard({ supervisor = false }: { supervisor?: boolean }) {
    const t = useTranslations("dayBoard");
    const s = useTranslations("status");
    const p = useTranslations("priority");
    const locale = useLocale();
    const { workspace, user } = useWorkspace();
    const [assigneeId, setAssignee] = useState("");
    const [status, setStatus] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const { data, isLoading, isError, error, refetch } = useDayBoardQuery(
        {
            workspaceId: workspace.id,
            supervisor,
            assigneeId: assigneeId || undefined,
            status: status || undefined,
            fromDay: from || undefined,
            toDay: to || undefined,
        },
        { pollingInterval: 60000, refetchOnFocus: true },
    );
    const { data: members } = useGetWorkspaceMembersQuery(
        { workspaceId: workspace.id },
        { skip: !supervisor },
    );
    const groups = supervisor
        ? (["overdue", "blocked", "review"] as const)
        : (["action", "overdue", "today"] as const);
    const forbidden = error && "status" in error && error.status === 403;
    return (
        <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">
                        {t(supervisor ? "teamTitle" : "title")}
                    </h1>
                    <p className="mt-1 text-sm text-text-secondary">
                        {t(supervisor ? "teamDescription" : "description")}
                    </p>
                </div>
                {data ? (
                    <div className="rounded-xl border border-border bg-surface px-4 py-2 text-sm">
                        <strong>{data.uniqueCount}</strong> {t("uniqueTasks")}
                        <p className="text-xs text-text-muted">
                            {data.day} · {data.timeZone}
                        </p>
                    </div>
                ) : null}
            </header>
            {supervisor ? (
                <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-surface p-3">
                    <label className="min-w-0 flex-1 text-xs">
                        {t("employee")}
                        <Select
                            value={assigneeId}
                            onChange={(e) => setAssignee(e.target.value)}
                        >
                            <option value="">{t("all")}</option>
                            {members?.map((m) => (
                                <option key={m.user.id} value={m.user.id}>
                                    {m.user.name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="min-w-0 flex-1 text-xs">
                        {t("status")}
                        <Select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                        >
                            <option value="">{t("all")}</option>
                            {[
                                "todo",
                                "in_progress",
                                "blocked",
                                "under_review",
                            ].map((v) => (
                                <option key={v} value={v}>
                                    {s(v)}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="text-xs">
                        {t("from")}
                        <Input
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                        />
                    </label>
                    <label className="text-xs">
                        {t("to")}
                        <Input
                            type="date"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                        />
                    </label>
                </div>
            ) : null}
            {isLoading ? (
                <p
                    role="status"
                    className="rounded-xl border border-border bg-surface p-6"
                >
                    {t("loading")}
                </p>
            ) : null}
            {isError ? (
                <div
                    role="alert"
                    className="rounded-xl border border-border bg-surface p-6"
                >
                    <p>{t(forbidden ? "forbidden" : "error")}</p>
                    <Button className="mt-3" onClick={() => void refetch()}>
                        {t("retry")}
                    </Button>
                </div>
            ) : null}
            {!isLoading && !isError ? (
                <div className="grid items-start gap-4 xl:grid-cols-3">
                    {groups.map((group) => (
                        <section
                            key={group}
                            className={`min-w-0 rounded-2xl border bg-surface p-4 ${group === "action" ? "border-primary/40" : "border-border"}`}
                        >
                            <h2 className="mb-4 flex items-center justify-between text-base font-semibold">
                                {t(group)}
                                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs">
                                    {data?.groups[group]?.length ?? 0}
                                </span>
                            </h2>
                            {!data?.groups[group]?.length ? (
                                <p className="py-6 text-sm text-text-muted">
                                    {t("empty")}
                                </p>
                            ) : (
                                <ul className="space-y-4">
                                    {data.groups[group]!.map((task) => (
                                        <li
                                            key={task.id}
                                            className="min-w-0 space-y-3 rounded-xl border border-border p-3"
                                        >
                                            <Link
                                                href={`/tasks?task=${encodeURIComponent(task.id)}`}
                                                className="block break-words text-sm font-semibold text-primary hover:underline"
                                            >
                                                {task.title}
                                            </Link>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge
                                                    tone={
                                                        statusTone[task.status]
                                                    }
                                                >
                                                    {s(task.status)}
                                                </Badge>
                                                <Badge
                                                    tone={
                                                        priorityTone[
                                                            task.priority
                                                        ]
                                                    }
                                                >
                                                    {p(task.priority)}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-text-secondary">
                                                {t("deadline")}:{" "}
                                                {task.dueDate
                                                    ? new Date(
                                                          task.dueDate,
                                                      ).toLocaleString(locale, {
                                                          timeZone:
                                                              data.timeZone,
                                                      })
                                                    : t("noDeadline")}
                                            </p>
                                            {supervisor ? (
                                                <p className="text-xs">
                                                    {t("employee")}:{" "}
                                                    {task.assigneeName ??
                                                        t("unassigned")}
                                                </p>
                                            ) : null}
                                            {task.status === "blocked" ? (
                                                <p className="rounded-lg bg-error/5 p-2 text-xs text-error">
                                                    {t("blockReason")}:{" "}
                                                    {task.blockReason ??
                                                        t("missingReason")}
                                                </p>
                                            ) : null}
                                            {group === "review" ? (
                                                <p className="text-xs text-text-secondary">
                                                    {t("reviewHint")}
                                                </p>
                                            ) : null}
                                            {task.actions.map((action) => (
                                                <p
                                                    key={action.id}
                                                    className="rounded-lg bg-primary/5 p-2 text-xs"
                                                >
                                                    <strong>
                                                        {t(
                                                            `actionKinds.${action.kind}`,
                                                        )}
                                                    </strong>
                                                    {action.reason
                                                        ? `: ${action.reason}`
                                                        : ""}
                                                </p>
                                            ))}
                                            <p className="text-xs text-text-muted">
                                                {t("next")}:{" "}
                                                {task.status === "blocked"
                                                    ? t("nextUnblock")
                                                    : task.status ===
                                                        "under_review"
                                                      ? t("nextReview")
                                                      : task.assigneeId ===
                                                          user.id
                                                        ? t("nextWork")
                                                        : t("nextOpen")}
                                            </p>
                                            <TaskActions
                                                task={task}
                                                actorId={user.id}
                                            />
                                            <Link
                                                href={`/tasks?task=${encodeURIComponent(task.id)}`}
                                                className="inline-block text-xs text-primary underline"
                                            >
                                                {t("open")}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
