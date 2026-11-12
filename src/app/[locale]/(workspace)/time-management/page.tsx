"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Play, Square, Trash2, TriangleAlert } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useGetTasksQuery } from "@/lib/redux/api";
import {
    useGetTimeReportQuery,
    useLogTimeMutation,
    useStopTimerMutation,
    useDeleteTimeMutation,
} from "@/lib/redux/time-api";
import { timeReasons, type TimeReason } from "@/lib/time-types";
import { getApiErrorMessage } from "@/lib/utils";

export default function TimeManagementPage() {
    const t = useTranslations("timeManagement");
    const locale = useLocale();
    const { workspace, user, canEdit } = useWorkspace();
    const toast = useToast();
    const [taskId, setTaskId] = useState("");
    const [mode, setMode] = useState("timer");
    const [startAt, setStart] = useState("");
    const [endAt, setEnd] = useState("");
    const [difficulty, setDifficulty] = useState(1);
    const [reason, setReason] = useState<TimeReason>("none");
    const [note, setNote] = useState("");
    const [period, setPeriod] = useState("30");
    const [reportNow] = useState(() => Date.now());
    const params = useMemo(
        () => ({
            workspaceId: workspace.id,
            ...(period === "all"
                ? {}
                : {
                      from: new Date(
                          reportNow - Number(period) * 86400000,
                      ).toISOString(),
                  }),
        }),
        [workspace.id, period, reportNow],
    );
    const {
        data: report,
        isLoading,
        isError,
        refetch,
    } = useGetTimeReportQuery(params, {
        pollingInterval: 30000,
        refetchOnFocus: true,
    });
    const { data: taskData } = useGetTasksQuery({
        workspaceId: workspace.id,
        pageSize: 100,
    });
    const [log, logState] = useLogTimeMutation();
    const [stop, stopState] = useStopTimerMutation();
    const [remove, removeState] = useDeleteTimeMutation();
    const busy =
        logState.isLoading || stopState.isLoading || removeState.isLoading;
    const duration = (minutes: number) => {
        const total = minutes > 0 ? Math.max(1, Math.round(minutes)) : 0;
        return `${Math.floor(total / 60)} ${t("hours")} ${total % 60} ${t("minutes")}`;
    };
    const reset = () => {
        setNote("");
        setReason("none");
        setDifficulty(1);
    };
    async function submit() {
        try {
            await log({
                taskId,
                difficulty,
                reason,
                note,
                ...(mode === "manual"
                    ? {
                          startAt: new Date(startAt).toISOString(),
                          endAt: new Date(endAt).toISOString(),
                      }
                    : {}),
            }).unwrap();
            toast.success(t("saved"));
            reset();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("error")));
        }
    }
    async function finish() {
        if (!report?.running) return;
        try {
            await stop({
                id: report.running.id,
                difficulty,
                reason,
                note,
            }).unwrap();
            reset();
            toast.success(t("saved"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("error")));
        }
    }
    const panel = "rounded-2xl border border-border bg-surface p-5 shadow-sm";
    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">{t("title")}</h1>
                    <p className="mt-1 text-sm text-text-secondary">
                        {t("description")}
                    </p>
                </div>
                <Select
                    aria-label={t("period")}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-auto"
                >
                    <option value="7">{t("week")}</option>
                    <option value="30">{t("month")}</option>
                    <option value="all">{t("all")}</option>
                </Select>
            </div>
            {isError ? (
                <div role="alert" className={panel}>
                    <p>{t("error")}</p>
                    <Button onClick={() => void refetch()}>{t("retry")}</Button>
                </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
                {[
                    [t("total"), duration(report?.totals.minutes ?? 0)],
                    [t("trackedTasks"), report?.totals.tasks ?? 0],
                    [t("overruns"), report?.totals.overruns ?? 0],
                ].map(([title, value]) => (
                    <div key={title} className={panel}>
                        <p className="text-sm text-text-secondary">{title}</p>
                        <p className="mt-2 text-2xl font-semibold">{value}</p>
                    </div>
                ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
                <section className={panel}>
                    <h2 className="mb-4 flex items-center gap-2 font-semibold">
                        <Clock size={18} />
                        {t("logTime")}
                    </h2>
                    {report?.running ? (
                        <div className="mb-4 rounded-xl bg-primary/10 p-3">
                            <p className="font-medium">
                                {t("running")}: {report.running.taskTitle}
                            </p>
                            <p className="text-sm">
                                {duration(report.running.minutes)} ·{" "}
                                {new Date(
                                    report.running.startAt,
                                ).toLocaleString(locale)}
                            </p>
                        </div>
                    ) : null}
                    <div className="space-y-3">
                        {!report?.running ? (
                            <>
                                <label className="block text-sm">
                                    {t("task")}
                                    <Select
                                        value={taskId}
                                        onChange={(e) =>
                                            setTaskId(e.target.value)
                                        }
                                    >
                                        <option value="">
                                            {t("selectTask")}
                                        </option>
                                        {(taskData?.items ?? [])
                                            .filter(
                                                (task) =>
                                                    task.status !== "completed",
                                            )
                                            .map((task) => (
                                                <option
                                                    key={task.id}
                                                    value={task.id}
                                                >
                                                    {task.title}
                                                </option>
                                            ))}
                                    </Select>
                                </label>
                                <Select
                                    aria-label={t("mode")}
                                    value={mode}
                                    onChange={(e) => setMode(e.target.value)}
                                >
                                    <option value="timer">{t("timer")}</option>
                                    <option value="manual">
                                        {t("manual")}
                                    </option>
                                </Select>
                                {mode === "manual" ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="text-sm">
                                            {t("start")}
                                            <Input
                                                type="datetime-local"
                                                value={startAt}
                                                onChange={(e) =>
                                                    setStart(e.target.value)
                                                }
                                            />
                                        </label>
                                        <label className="text-sm">
                                            {t("end")}
                                            <Input
                                                type="datetime-local"
                                                value={endAt}
                                                onChange={(e) =>
                                                    setEnd(e.target.value)
                                                }
                                            />
                                        </label>
                                    </div>
                                ) : null}
                            </>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm">
                                {t("difficulty")}
                                <Select
                                    value={difficulty}
                                    onChange={(e) =>
                                        setDifficulty(Number(e.target.value))
                                    }
                                >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <option key={n} value={n}>
                                            {n} — {t(`level${n}`)}
                                        </option>
                                    ))}
                                </Select>
                            </label>
                            <label className="text-sm">
                                {t("reason")}
                                <Select
                                    value={reason}
                                    onChange={(e) =>
                                        setReason(e.target.value as TimeReason)
                                    }
                                >
                                    {timeReasons.map((r) => (
                                        <option key={r} value={r}>
                                            {t(`reasons.${r}`)}
                                        </option>
                                    ))}
                                </Select>
                            </label>
                        </div>
                        <label className="block text-sm">
                            {t("note")}
                            <Textarea
                                value={note}
                                maxLength={2000}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder={t("notePlaceholder")}
                            />
                        </label>
                        {report?.running ? (
                            <Button
                                loading={busy}
                                onClick={() => void finish()}
                            >
                                <Square size={15} />
                                {t("stop")}
                            </Button>
                        ) : (
                            <Button
                                loading={busy}
                                disabled={
                                    !canEdit ||
                                    !taskId ||
                                    (mode === "manual" && (!startAt || !endAt))
                                }
                                onClick={() => void submit()}
                            >
                                <Play size={15} />
                                {mode === "manual"
                                    ? t("save")
                                    : t("startTimer")}
                            </Button>
                        )}
                    </div>
                </section>
                <section className={panel}>
                    <h2 className="font-semibold">{t("analysis")}</h2>
                    <p className="mt-2 text-sm text-text-secondary">
                        {t("analysisHint")}
                    </p>
                    {!report?.tasks.length ? (
                        <p className="mt-6 text-text-muted">
                            {isLoading ? t("loading") : t("empty")}
                        </p>
                    ) : (
                        <div className="mt-4 space-y-4">
                            {report.tasks.slice(0, 6).map((task) => (
                                <div key={task.id}>
                                    <div className="flex justify-between gap-3 text-sm">
                                        <span>{task.title}</span>
                                        <span className="shrink-0">
                                            {duration(task.minutes)}
                                        </span>
                                    </div>
                                    <div className="mt-1 h-2 overflow-hidden rounded bg-surface-elevated">
                                        <div
                                            className="h-full rounded bg-primary"
                                            style={{
                                                width: `${Math.max(2, (task.minutes / (report.tasks[0]?.minutes || 1)) * 100)}%`,
                                            }}
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-text-muted">
                                        {t("estimate")}:{" "}
                                        {task.estimateMinutes === null
                                            ? "—"
                                            : duration(
                                                  task.estimateMinutes,
                                              )}{" "}
                                        · {t("difficulty")}:{" "}
                                        {task.difficulty.toFixed(1)}/5
                                    </p>
                                    {task.overrun ? (
                                        <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                                            <TriangleAlert size={13} />
                                            {t("overrun")}
                                        </p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                    <h3 className="mt-6 text-sm font-semibold">
                        {t("reportedReasons")}
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm">
                        {report?.reasons.map((r) => (
                            <li
                                key={r.reason}
                                className="flex justify-between gap-3"
                            >
                                <span>{t(`reasons.${r.reason}`)}</span>
                                <span>{duration(r.minutes)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
            <section className={panel}>
                <h2 className="mb-4 font-semibold">{t("history")}</h2>
                {!report?.entries.length ? (
                    <p className="text-sm text-text-muted">{t("empty")}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-border text-text-muted">
                                    {[
                                        t("task"),
                                        t("employee"),
                                        t("start"),
                                        t("spent"),
                                        t("reason"),
                                        t("note"),
                                        "",
                                    ].map((label, i) => (
                                        <th key={i} className="px-2 py-3">
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.entries.map((entry) => (
                                    <tr
                                        key={entry.id}
                                        className="border-b border-border/50"
                                    >
                                        <td className="px-2 py-3">
                                            {entry.taskTitle}
                                        </td>
                                        <td className="px-2 py-3">
                                            {entry.userName}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3">
                                            {new Date(
                                                entry.startAt,
                                            ).toLocaleString(locale)}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3">
                                            {duration(entry.minutes)}
                                            {!entry.endAt
                                                ? ` · ${t("running")}`
                                                : ""}
                                        </td>
                                        <td className="px-2 py-3">
                                            {t(`reasons.${entry.reason}`)} ·{" "}
                                            {entry.difficulty}/5
                                        </td>
                                        <td className="max-w-xs whitespace-pre-wrap px-2 py-3">
                                            {entry.note || "—"}
                                        </td>
                                        <td>
                                            {entry.userId === user.id ? (
                                                <button
                                                    aria-label={t("delete")}
                                                    disabled={busy}
                                                    onClick={() => {
                                                        if (
                                                            window.confirm(
                                                                t(
                                                                    "confirmDelete",
                                                                ),
                                                            )
                                                        )
                                                            void remove(
                                                                entry.id,
                                                            )
                                                                .unwrap()
                                                                .catch((e) =>
                                                                    toast.error(
                                                                        getApiErrorMessage(
                                                                            e,
                                                                            t(
                                                                                "error",
                                                                            ),
                                                                        ),
                                                                    ),
                                                                );
                                                    }}
                                                    className="p-2 text-text-muted hover:text-error"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
