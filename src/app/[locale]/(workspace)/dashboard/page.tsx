"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    CircleAlert,
    Clock,
    FolderKanban,
    ListChecks,
    Sparkles,
    TrendingUp,
} from "lucide-react";
import {useEffect, useMemo, useState} from "react";

import {Avatar} from "@/components/ui/avatar";
import {Badge, priorityTone, statusTone} from "@/components/ui/badge";
import {
    Card,
    CardHeader,
    PageHeader,
    ProgressBar,
    StatCard,
} from "@/components/ui/layout";
import {PageLoader } from "@/components/ui/states";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link, useRouter} from "@/i18n/navigation";
import {
    useCreateAiPlanMutation,
    useGetAiPlansQuery,
    useGetAnalyticsOverviewQuery,
    useGetCalendarEventsQuery,
    useGetProjectsQuery,
    useGetTasksQuery,
    useGetWorkspaceMembersQuery,
} from "@/lib/redux/api";
import {
    endOfMonth,
    formatDate,
    formatTime,
    getApiErrorMessage,
    startOfMonth,
} from "@/lib/utils";

const statusColors: Record<string, string> = {
    todo: "#94A3B8",
    queued: "#60A5FA",
    in_progress: "#4F46E5",
    under_review: "#F59E0B",
    blocked: "#EF4444",
    completed: "#10B981",
};

export default function DashboardPage() {    const t = useTranslations("dashboard");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const tPriority = useTranslations("priority");
    const locale = useLocale();
    const router = useRouter();
    const toast = useToast();
    const {user, workspace, canEdit} = useWorkspace();

    const [greetingKey, setGreetingKey] = useState<
        "greetingMorning" | "greetingAfternoon" | "greetingEvening"
    >("greetingMorning");

    useEffect(() => {
        const hour = new Date().getHours();
        setGreetingKey(
            hour < 12
                ? "greetingMorning"
                : hour < 18
                  ? "greetingAfternoon"
                  : "greetingEvening",
        );
    }, []);

    const {data: analytics, isLoading: analyticsLoading} =
        useGetAnalyticsOverviewQuery({workspaceId: workspace.id});
    const {data: tasksData, isLoading: tasksLoading} = useGetTasksQuery({
        workspaceId: workspace.id,
        due: "week",
        pageSize: 6,
    });
    const {data: plans} = useGetAiPlansQuery({workspaceId: workspace.id});
    const {data: membersData} = useGetWorkspaceMembersQuery({
        workspaceId: workspace.id,
    });
    const {data: projectsData} = useGetProjectsQuery({
        workspaceId: workspace.id,
        pageSize: 100,
    });
    const now = useMemo(() => new Date(), []);
    const {data: events} = useGetCalendarEventsQuery({
        workspaceId: workspace.id,
        from: startOfMonth(now).toISOString(),
        to: endOfMonth(now).toISOString(),
    });
    const [createPlan, planState] = useCreateAiPlanMutation();

    const plan = plans?.[0];
    const inProgress =
        analytics?.byStatus.find((item) => item.status === "in_progress")
            ?.count ?? 0;

    const todayEvents = useMemo(() => {
        const today = new Date();
        return (events ?? [])
            .filter((event) => {
                const start = new Date(event.startAt);
                return (
                    start.getFullYear() === today.getFullYear() &&
                    start.getMonth() === today.getMonth() &&
                    start.getDate() === today.getDate()
                );
            })
            .slice(0, 5);
    }, [events]);

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

    const projectById = useMemo(() => {
        const map = new Map<string, {name: string; color: string}>();
        for (const project of projectsData?.items ?? []) {
            map.set(project.id, {name: project.name, color: project.color});
        }
        return map;
    }, [projectsData]);

    const generatePlan = async () => {
        try {
            await createPlan({
                workspaceId: workspace.id,
                availableMinutes: 480,
            }).unwrap();
            toast.success(t("planReady"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("planError")));
        }
    };

    const openTask = (id: string) => {
        router.push(`/tasks?task=${encodeURIComponent(id)}`);
    };

    if (analyticsLoading) {
        return <PageLoader label={tCommon("loading")} />;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow={formatDate(now, locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                })}
                title={t(greetingKey, {name: user.name.split(" ")[0]})}
                description={t("priorityTasksSummary", {
                    count: analytics?.totals.open ?? 0,
                })}
                actions={
                    <>
                        <Link
                            href="/ai-assistant"
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text-primary hover:bg-surface-hover"
                        >
                            <Sparkles size={16} className="text-accent" />
                            {t("aiDailyFlowOptimization")}
                        </Link>
                        <Link
                            href="/tasks?new=1"
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-white hover:bg-primary-hover"
                        >
                            <ListChecks size={16} />
                            {tCommon("newTask")}
                        </Link>
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t("totalTasks")}
                    value={analytics?.totals.tasks ?? 0}
                    hint={t("regularSync")}
                    icon={<ListChecks size={17} />}
                />
                <StatCard
                    label={t("inProgress")}
                    value={inProgress}
                    hint={t("awaitingTeamReview", {
                        count:
                            analytics?.byStatus.find(
                                (item) => item.status === "under_review",
                            )?.count ?? 0,
                    })}
                    icon={<Clock size={17} />}
                    tone="info"
                />
                <StatCard
                    label={t("completed")}
                    value={analytics?.totals.completed ?? 0}
                    hint={t("completionRateValue", {
                        value: analytics?.totals.completionRate ?? 0,
                    })}
                    icon={<CheckCircle2 size={17} />}
                    tone="success"
                />
                <StatCard
                    label={t("overdue")}
                    value={analytics?.totals.overdue ?? 0}
                    hint={t("actionNeeded")}
                    icon={<CircleAlert size={17} />}
                    tone="danger"
                />
            </div>

            <div className="grid min-w-0 gap-4 xl:grid-cols-3">
                <div className="min-w-0 space-y-4 xl:col-span-2">
                    <Card>
                        <CardHeader
                            title={t("todaysTasks")}
                            description={t("highPriorityTasks", {
                                count: tasksData?.pagination.total ?? 0,
                            })}
                            action={
                                <Link
                                    href="/tasks"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                    {t("allTasks", {
                                        count:
                                            analytics?.totals.tasks ?? 0,
                                    })}
                                    <ArrowRight size={13} />
                                </Link>
                            }
                        />

                        {tasksLoading ? (
                            <PageLoader label={tCommon("loading")} />
                        ) : (tasksData?.items ?? []).length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
                                {t("noTasks")}
                            </p>
                        ) : (
                            <div className="scroll-area max-h-[420px] divide-y divide-border overflow-y-auto pr-1">
                                {(tasksData?.items ?? []).map((task) => {
                                    const assignee = task.assigneeId
                                        ? memberById.get(task.assigneeId)
                                        : null;
                                    return (
                                        <button
                                            key={task.id}
                                            type="button"
                                            onClick={() => openTask(task.id)}
                                            className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                                        >
                                            <span
                                                className={`mt-0.5 size-2 shrink-0 rounded-full ${
                                                    task.status === "completed"
                                                        ? "bg-success"
                                                        : task.priority ===
                                                            "urgent"
                                                          ? "bg-error"
                                                          : "bg-primary"
                                                }`}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-text-primary">
                                                    {task.title}
                                                </p>
                                                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                                                    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                                                        <span
                                                            className="size-1.5 shrink-0 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    projectById.get(
                                                                        task.projectId,
                                                                    )?.color ??
                                                                    "#94A3B8",
                                                            }}
                                                        />
                                                        <span className="truncate">
                                                            {projectById.get(
                                                                task.projectId,
                                                            )?.name ?? "—"}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0">
                                                        ·
                                                    </span>
                                                    <span className="shrink-0">
                                                        {formatDate(
                                                            task.dueDate,
                                                            locale,
                                                        )}
                                                    </span>
                                                </p>
                                            </div>
                                            <Badge
                                                tone={statusTone[task.status]}
                                                className="max-sm:hidden"
                                            >
                                                {tStatus(task.status)}
                                            </Badge>
                                            <Badge
                                                tone={priorityTone[task.priority]}
                                                className="max-md:hidden"
                                            >
                                                {tPriority(task.priority)}
                                            </Badge>
                                            {assignee ? (
                                                <Avatar
                                                    name={assignee.name}
                                                    src={assignee.avatarUrl}
                                                    size="xs"
                                                />
                                            ) : (
                                                <span className="text-[10px] text-text-muted">
                                                    {tCommon("unassigned")}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card>
                        <CardHeader
                            title={t("departmentPerformance")}
                            description={t("completionRate")}
                            action={
                                <Link
                                    href="/analytics"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                    {tCommon("viewAll")}
                                    <ArrowRight size={13} />
                                </Link>
                            }
                        />
                        <div className="scroll-area max-h-[320px] space-y-3 overflow-y-auto pr-1">
                            {(analytics?.byDepartment ?? []).map((department) => {
                                const percent =
                                    department.total > 0
                                        ? Math.round(
                                              (department.completed /
                                                  department.total) *
                                                  100,
                                          )
                                        : 0;
                                return (
                                    <div key={department.departmentId}>
                                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <span
                                                    className="size-2 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            department.color,
                                                    }}
                                                />
                                                <span className="truncate font-medium text-text-primary">
                                                    {department.name}
                                                </span>
                                            </span>
                                            <span className="shrink-0 tabular-nums text-text-muted">
                                                {department.completed}/
                                                {department.total} · {percent}%
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
                            })}
                        </div>
                    </Card>

                    <div className="grid min-w-0 gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader
                                title={t("recentlyCompleted")}
                                description={t("productivitySprint")}
                            />
                            <div className="space-y-2.5">
                                {(analytics?.recentlyCompleted ?? []).length ===
                                0 ? (
                                    <p className="text-sm text-text-muted">
                                        {t("noCompleted")}
                                    </p>
                                ) : (
                                    (analytics?.recentlyCompleted ?? [])
                                        .slice(0, 5)
                                        .map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() =>
                                                    openTask(item.id)
                                                }
                                                className="flex w-full items-center gap-2 rounded-lg py-1 text-left hover:bg-surface-hover"
                                            >
                                                <CheckCircle2
                                                    size={15}
                                                    className="shrink-0 text-success"
                                                />
                                                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                                                    {item.title}
                                                </span>
                                                <span className="shrink-0 text-[10px] text-text-muted">
                                                    {formatDate(
                                                        item.completedAt,
                                                        locale,
                                                    )}
                                                </span>
                                            </button>
                                        ))
                                )}
                            </div>
                        </Card>

                        <Card>
                            <CardHeader
                                title={t("todaySchedule")}
                                description={formatDate(now, locale)}
                                action={
                                    <Link
                                        href="/calendar"
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        {tCommon("calendar")}
                                    </Link>
                                }
                            />
                            <div className="scroll-area max-h-[280px] space-y-2.5 overflow-y-auto pr-1">
                                {todayEvents.length === 0 ? (
                                    <p className="text-sm text-text-muted">
                                        {t("scheduleEmpty")}
                                    </p>
                                ) : (
                                    todayEvents.map((event) => (
                                        <div
                                            key={event.id}
                                            className="flex items-start gap-2.5"
                                        >
                                            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <CalendarDays size={14} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-text-primary">
                                                    {event.title}
                                                </p>
                                                <p className="text-[11px] text-text-muted">
                                                    {formatTime(
                                                        event.startAt,
                                                        locale,
                                                    )}{" "}
                                                    –{" "}
                                                    {formatTime(
                                                        event.endAt,
                                                        locale,
                                                    )}
                                                    {event.project
                                                        ? ` · ${event.project.name}`
                                                        : ""}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    </div>
                </div>

                <div className="min-w-0 space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
                                <Sparkles size={11} />
                                TaskFlow AI
                            </span>
                            <span className="text-[10px] text-white/60">
                                v1.0
                            </span>
                        </div>
                        <h2 className="mt-3 text-lg font-semibold leading-snug">
                            {t("aiDailyFlowOptimization")}
                        </h2>
                        <p className="mt-1.5 text-xs leading-5 text-white/75">
                            {plan && plan.items.length > 0
                                ? t("aiPlanSummary", {
                                      count: plan.items.length,
                                  })
                                : t("aiPlanEmpty")}
                        </p>

                        {plan && plan.items.length > 0 ? (
                            <div className="mt-3 space-y-1.5">
                                {plan.items.slice(0, 4).map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1.5 text-xs backdrop-blur"
                                    >
                                        <span className="shrink-0 tabular-nums text-white/60">
                                            {formatTime(item.startAt, locale)}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">
                                            {item.task?.title ??
                                                item.reason ??
                                                t("focusBlock")}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className="mt-4 flex gap-2">
                            {canEdit ? (
                                <button
                                    type="button"
                                    disabled={planState.isLoading}
                                    onClick={() => void generatePlan()}
                                    className="h-9 flex-1 rounded-lg bg-white text-xs font-semibold text-indigo-700 transition-opacity hover:opacity-90 disabled:opacity-60"
                                >
                                    {planState.isLoading
                                        ? tCommon("loading")
                                        : plan
                                          ? t("regeneratePlan")
                                          : t("generatePlan")}
                                </button>
                            ) : null}
                            <Link
                                href="/ai-assistant"
                                className="flex h-9 items-center justify-center rounded-lg border border-white/25 px-3 text-xs font-medium text-white hover:bg-white/10"
                            >
                                {tCommon("viewPlan")}
                            </Link>
                        </div>
                    </div>

                    <Card>
                        <CardHeader
                            title={t("upcomingDeadlines")}
                            action={
                                <FolderKanban
                                    size={16}
                                    className="text-text-muted"
                                />
                            }
                        />
                        <div className="scroll-area max-h-[280px] space-y-2 overflow-y-auto pr-1">
                            {(analytics?.upcoming ?? []).length === 0 ? (
                                <p className="text-sm text-text-muted">
                                    {t("noUpcoming")}
                                </p>
                            ) : (
                                (analytics?.upcoming ?? []).map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => openTask(item.id)}
                                        className="flex w-full items-start gap-2 rounded-lg py-1 text-left hover:bg-surface-hover"
                                    >
                                        <TrendingUp
                                            size={14}
                                            className="mt-1 shrink-0 text-text-muted"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-text-primary">
                                                {item.title}
                                            </span>
                                            <span className="text-[10px] text-text-muted">
                                                {formatDate(
                                                    item.dueDate,
                                                    locale,
                                                )}
                                            </span>
                                        </span>
                                        <Badge
                                            tone={priorityTone[item.priority]}
                                        >
                                            {tPriority(item.priority)}
                                        </Badge>
                                    </button>
                                ))
                            )}
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            title={t("taskDistribution")}
                            description={t("taskDistributionDescription")}
                        />
                        <div className="space-y-3">
                            {(analytics?.byStatus ?? [])
                                .filter((item) => item.count > 0)
                                .sort((a, b) => b.count - a.count)
                                .map((item) => {
                                    const percent =
                                        (analytics?.totals.tasks ?? 0) > 0
                                            ? Math.round(
                                                  (item.count /
                                                      (analytics?.totals
                                                          .tasks ?? 1)) *
                                                      100,
                                              )
                                            : 0;
                                    return (
                                        <div key={item.status}>
                                            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <span
                                                        className="size-2 shrink-0 rounded-full"
                                                        style={{
                                                            backgroundColor:
                                                                statusColors[
                                                                    item.status
                                                                ] ?? "#94A3B8",
                                                        }}
                                                    />
                                                    <span className="truncate text-text-secondary">
                                                        {tStatus(item.status)}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 tabular-nums text-text-muted">
                                                    {item.count} · {percent}%
                                                </span>
                                            </div>
                                            <ProgressBar
                                                value={percent}
                                                tone={
                                                    item.status === "completed"
                                                        ? "success"
                                                        : item.status ===
                                                            "blocked"
                                                          ? "danger"
                                                          : "primary"
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            {(analytics?.byStatus ?? []).every(
                                (item) => item.count === 0,
                            ) ? (
                                <p className="text-sm text-text-muted">
                                    {t("noTasks")}
                                </p>
                            ) : null}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
