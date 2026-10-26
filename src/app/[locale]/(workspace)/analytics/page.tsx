"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    ListChecks,
    TrendingUp,
} from "lucide-react";
import {useMemo, useState} from "react";

import {Avatar} from "@/components/ui/avatar";
import {Badge, priorityTone, statusTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/input";
import {
    Card,
    CardHeader,
    PageHeader,
    ProgressBar,
    StatCard,
} from "@/components/ui/layout";
import {PageLoader} from "@/components/ui/states";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link} from "@/i18n/navigation";
import {
    useGetAnalyticsOverviewQuery,
    useGetDepartmentsQuery,
    useGetWorkspaceMembersQuery,
} from "@/lib/redux/api";
import {formatDate} from "@/lib/utils";

type Period = "all" | "7d" | "30d" | "90d";

const statusColors: Record<string, string> = {
    todo: "#94A3B8",
    queued: "#60A5FA",
    in_progress: "#4F46E5",
    under_review: "#F59E0B",
    blocked: "#EF4444",
    completed: "#10B981",
};

const priorityColors: Record<string, string> = {
    low: "#94A3B8",
    medium: "#60A5FA",
    high: "#F59E0B",
    urgent: "#EF4444",
};

export default function AnalyticsPage() {
    const t = useTranslations("analyticsPage");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const tPriority = useTranslations("priority");
    const locale = useLocale();
    const {workspace} = useWorkspace();

    const [departmentId, setDepartmentId] = useState("");
    const [period, setPeriod] = useState<Period>("all");

    const {from, to} = useMemo(() => {
        if (period === "all") return {from: undefined, to: undefined};
        const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
        const start = new Date();
        start.setDate(start.getDate() - days);
        return {from: start.toISOString(), to: new Date().toISOString()};
    }, [period]);

    const {data: departments} = useGetDepartmentsQuery();
    const {data: membersData} = useGetWorkspaceMembersQuery({
        workspaceId: workspace.id,
    });
    const memberById = useMemo(() => {
        const map = new Map<string, {name: string; avatarUrl: string | null}>();
        for (const member of membersData ?? []) {
            map.set(member.user.id, {
                name: member.user.name,
                avatarUrl: member.user.avatarUrl,
            });
        }
        return map;
    }, [membersData]);
    const {data: analytics, isLoading} = useGetAnalyticsOverviewQuery({
        workspaceId: workspace.id,
        departmentId: departmentId || undefined,
        from,
        to,
    });

    const total = analytics?.totals.tasks ?? 0;
    const completionRate = analytics?.totals.completionRate ?? 0;

    const exportCsv = () => {
        if (!analytics) return;
        const rows = [
            [t("csvMetric"), t("csvValue")],
            [t("tasksInPeriod"), analytics.totals.tasks],
            [t("completed"), analytics.totals.completed],
            [t("open"), analytics.totals.open],
            [t("overdue"), analytics.totals.overdue],
            [t("completionRate"), `${analytics.totals.completionRate}%`],
            [],
            [t("department"), t("csvTotal"), t("completed"), t("csvRate")],
            ...analytics.byDepartment.map((item) => [
                item.name,
                item.total,
                item.completed,
                item.total > 0
                    ? `${Math.round((item.completed / item.total) * 100)}%`
                    : "0%",
            ]),
        ];
        const csv = rows
            .map((row) =>
                row
                    .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
                    .join(","),
            )
            .join("\n");
        const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `taskflow-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return <PageLoader label={tCommon("loading")} />;
    }

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description")}
                actions={
                    <>
                        <Select
                            value={period}
                            onChange={(event) =>
                                setPeriod(event.target.value as Period)
                            }
                            aria-label={t("period")}
                            className="w-auto min-w-[140px]"
                        >
                            <option value="all">{t("periodAll")}</option>
                            <option value="7d">{t("period7d")}</option>
                            <option value="30d">{t("period30d")}</option>
                            <option value="90d">{t("period90d")}</option>
                        </Select>
                        <Select
                            value={departmentId}
                            onChange={(event) =>
                                setDepartmentId(event.target.value)
                            }
                            aria-label={t("department")}
                            className="w-auto min-w-[150px]"
                        >
                            <option value="">{t("allDepartments")}</option>
                            {(departments ?? []).map((department) => (
                                <option
                                    key={department.id}
                                    value={department.id}
                                >
                                    {department.name}
                                </option>
                            ))}
                        </Select>
                        <Button variant="outline" onClick={exportCsv}>
                            <Download size={15} />
                            {t("export")}
                        </Button>
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t("tasksInPeriod")}
                    value={total}
                    icon={<ListChecks size={17} />}
                    hint={t("allTasksHint")}
                />
                <StatCard
                    label={t("completed")}
                    value={analytics?.totals.completed ?? 0}
                    icon={<CheckCircle2 size={17} />}
                    tone="success"
                    hint={`${completionRate}% ${t("completionRate")}`}
                />
                <StatCard
                    label={t("open")}
                    value={analytics?.totals.open ?? 0}
                    icon={<TrendingUp size={17} />}
                    tone="info"
                />
                <StatCard
                    label={t("overdue")}
                    value={analytics?.totals.overdue ?? 0}
                    icon={<AlertTriangle size={17} />}
                    tone="danger"
                    hint={t("actionNeeded")}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <CardHeader
                        title={t("completionRate")}
                        description={t("completionDescription")}
                    />
                    <div className="flex items-center gap-5">
                        <div
                            className="relative flex size-32 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: `conic-gradient(var(--success) ${completionRate * 3.6}deg, var(--surface-hover) 0deg)`,
                            }}
                        >
                            <div className="flex size-24 flex-col items-center justify-center rounded-full bg-surface">
                                <span className="text-2xl font-semibold tabular-nums text-text-primary">
                                    {completionRate}%
                                </span>
                                <span className="text-[10px] text-text-muted">
                                    {t("completed")}
                                </span>
                            </div>
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-text-secondary">
                                    {t("completed")}
                                </span>
                                <span className="font-semibold tabular-nums text-text-primary">
                                    {analytics?.totals.completed ?? 0}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-text-secondary">
                                    {t("open")}
                                </span>
                                <span className="font-semibold tabular-nums text-text-primary">
                                    {analytics?.totals.open ?? 0}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-text-secondary">
                                    {t("overdue")}
                                </span>
                                <span className="font-semibold tabular-nums text-error">
                                    {analytics?.totals.overdue ?? 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card>
                    <CardHeader title={t("byStatus")} />
                    <div className="space-y-2.5">
                        {(analytics?.byStatus ?? []).length === 0 ? (
                            <p className="text-sm text-text-muted">
                                {t("noData")}
                            </p>
                        ) : (
                            (analytics?.byStatus ?? [])
                                .slice()
                                .sort((a, b) => b.count - a.count)
                                .map((item) => (
                                    <div key={item.status}>
                                        <div className="mb-1 flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 text-text-secondary">
                                                <span
                                                    className="size-2 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            statusColors[
                                                                item.status
                                                            ] ?? "#94A3B8",
                                                    }}
                                                />
                                                {tStatus(item.status)}
                                            </span>
                                            <span className="tabular-nums text-text-muted">
                                                {item.count}
                                            </span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${total > 0 ? (item.count / total) * 100 : 0}%`,
                                                    backgroundColor:
                                                        statusColors[
                                                            item.status
                                                        ] ?? "#94A3B8",
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                </Card>

                <Card>
                    <CardHeader title={t("byPriority")} />
                    <div className="space-y-2.5">
                        {(analytics?.byPriority ?? []).length === 0 ? (
                            <p className="text-sm text-text-muted">
                                {t("noData")}
                            </p>
                        ) : (
                            (analytics?.byPriority ?? [])
                                .slice()
                                .sort((a, b) => b.count - a.count)
                                .map((item) => (
                                    <div key={item.priority}>
                                        <div className="mb-1 flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 text-text-secondary">
                                                <span
                                                    className="size-2 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            priorityColors[
                                                                item.priority
                                                            ] ?? "#94A3B8",
                                                    }}
                                                />
                                                {tPriority(item.priority)}
                                            </span>
                                            <span className="tabular-nums text-text-muted">
                                                {item.count}
                                            </span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${total > 0 ? (item.count / total) * 100 : 0}%`,
                                                    backgroundColor:
                                                        priorityColors[
                                                            item.priority
                                                        ] ?? "#94A3B8",
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader
                        title={t("byDepartment")}
                        description={t("byDepartmentDescription")}
                    />
                    <div className="space-y-3">
                        {(analytics?.byDepartment ?? []).length === 0 ? (
                            <p className="text-sm text-text-muted">
                                {t("noData")}
                            </p>
                        ) : (
                            (analytics?.byDepartment ?? []).map((item) => {
                                const percent =
                                    item.total > 0
                                        ? Math.round(
                                              (item.completed / item.total) *
                                                  100,
                                          )
                                        : 0;
                                return (
                                    <div key={item.departmentId}>
                                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                            <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                                                <span
                                                    className="size-2 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            item.color,
                                                    }}
                                                />
                                                <span className="truncate">
                                                    {item.name}
                                                </span>
                                            </span>
                                            <span className="shrink-0 tabular-nums text-text-muted">
                                                {item.completed}/{item.total} ·{" "}
                                                {percent}%
                                            </span>
                                        </div>
                                        <ProgressBar
                                            value={percent}
                                            tone={
                                                percent >= 70
                                                    ? "success"
                                                    : percent >= 40
                                                      ? "primary"
                                                      : "warning"
                                            }
                                        />
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Card>

                <Card>
                    <CardHeader
                        title={t("upcoming")}
                        description={t("upcomingDescription")}
                        action={
                            <Link
                                href="/tasks"
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                {tCommon("viewAll")}
                            </Link>
                        }
                    />
                    <div className="space-y-2">
                        {(analytics?.upcoming ?? []).length === 0 ? (
                            <p className="text-sm text-text-muted">
                                {t("noUpcoming")}
                            </p>
                        ) : (
                            (analytics?.upcoming ?? []).map((item) => (
                                <Link
                                    key={item.id}
                                    href={`/tasks?task=${encodeURIComponent(item.id)}`}
                                    className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-surface-hover"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-text-primary">
                                            {item.title}
                                        </span>
                                        <span className="text-[10px] text-text-muted">
                                            {formatDate(item.dueDate, locale)}
                                        </span>
                                    </span>
                                    <Badge
                                        tone={priorityTone[item.priority]}
                                    >
                                        {tPriority(item.priority)}
                                    </Badge>
                                    <Badge tone={statusTone[item.status]}>
                                        {tStatus(item.status)}
                                    </Badge>
                                </Link>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            <Card>
                <CardHeader
                    title={t("recentlyCompleted")}
                    description={t("recentlyCompletedDescription")}
                />
                {analytics?.recentlyCompleted.length === 0 ? (
                    <p className="text-sm text-text-muted">
                        {t("noCompleted")}
                    </p>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {(analytics?.recentlyCompleted ?? []).map((item) => (
                            <Link
                                key={item.id}
                                href={`/tasks?task=${encodeURIComponent(item.id)}`}
                                className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated/40 p-2.5 transition-colors hover:bg-surface-hover"
                            >
                                <CheckCircle2
                                    size={16}
                                    className="shrink-0 text-success"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium text-text-primary">
                                        {item.title}
                                    </span>
                                    <span className="text-[10px] text-text-muted">
                                        {formatDate(item.completedAt, locale)}
                                    </span>
                                </span>
                                {item.assigneeId ? (
                                    <Avatar
                                        name={
                                            memberById.get(item.assigneeId)
                                                ?.name ?? "—"
                                        }
                                        src={
                                            memberById.get(item.assigneeId)
                                                ?.avatarUrl
                                        }
                                        size="xs"
                                    />
                                ) : null}
                            </Link>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
