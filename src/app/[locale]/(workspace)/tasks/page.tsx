"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    FilterX,
    Kanban,
    List,
    Plus,
    Search,
    SquareCheck,
} from "lucide-react";
import {useSearchParams} from "next/navigation";
import {
    Suspense,
    useDeferredValue,
    useEffect,
    useMemo,
    useState,
} from "react";

import {Avatar} from "@/components/ui/avatar";
import {Badge, priorityTone, statusTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input, Select} from "@/components/ui/input";
import {PageHeader} from "@/components/ui/layout";
import {EmptyState, ListSkeleton} from "@/components/ui/states";
import {SegmentedControl} from "@/components/ui/tabs";
import {useToast} from "@/components/ui/toast";
import {TaskDetailDialog} from "@/components/tasks/task-detail-dialog";
import {TaskFormDialog} from "@/components/tasks/task-form-dialog";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {taskPriorities, taskStatuses} from "@/lib/domain";
import {
    useGetProjectsQuery,
    useGetTasksQuery,
    useGetWorkspaceMembersQuery,
    useUpdateTaskMutation,
} from "@/lib/redux/api";
import type {
    Project,
    TaskDetail,
    TaskListItem,
    TaskListArgs,
} from "@/lib/redux/types";
import {
    cn,
    formatDate,
    getApiErrorMessage,
    isOverdue,
} from "@/lib/utils";
import {useRouter} from "@/i18n/navigation";

type ViewMode = "list" | "kanban";

const kanbanStatuses = [...taskStatuses];

function TasksPageContent() {
    const t = useTranslations("tasks");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const tPriority = useTranslations("priority");
    const locale = useLocale();
    const router = useRouter();
    const toast = useToast();
    const searchParams = useSearchParams();
    const {workspace, canEdit} = useWorkspace();

    const [view, setView] = useState<ViewMode>("list");
    const [search, setSearch] = useState(searchParams.get("search") ?? "");
    const deferredSearch = useDeferredValue(search);
    const [status, setStatus] = useState<string>("");
    const [priority, setPriority] = useState<string>("");
    const [due, setDue] = useState<string>("");
    const [assignee, setAssignee] = useState<string>("");
    const [projectId, setProjectId] = useState<string>("");
    const [page, setPage] = useState(1);

    const [detailId, setDetailId] = useState<string | null>(
        searchParams.get("task"),
    );
    const [formOpen, setFormOpen] = useState(searchParams.get("new") === "1");
    const [editing, setEditing] = useState<TaskDetail | null>(null);

    const {data: projectsData} = useGetProjectsQuery({
        workspaceId: workspace.id,
        pageSize: 100,
    });
    const {data: membersData} = useGetWorkspaceMembersQuery({
        workspaceId: workspace.id,
    });

    const queryArgs = useMemo<TaskListArgs>(
        () => ({
            workspaceId: workspace.id,
            search: deferredSearch.trim() || undefined,
            status: (status || undefined) as TaskListArgs["status"],
            priority: (priority || undefined) as TaskListArgs["priority"],
            due: (due || undefined) as TaskListArgs["due"],
            assigneeId: assignee || undefined,
            projectId: projectId || undefined,
            page: view === "kanban" ? 1 : page,
            pageSize: view === "kanban" ? 100 : 12,
        }),
        [
            workspace.id,
            deferredSearch,
            status,
            priority,
            due,
            assignee,
            projectId,
            page,
            view,
        ],
    );

    const {data, isLoading, isFetching} = useGetTasksQuery(queryArgs);
    const [updateTask] = useUpdateTaskMutation();

    const projects = useMemo(() => projectsData?.items ?? [], [projectsData]);
    const projectById = useMemo(() => {
        const map = new Map<string, Project>();
        for (const project of projects) map.set(project.id, project);
        return map;
    }, [projects]);

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

    useEffect(() => {
        const nextSearch = searchParams.get("search") ?? "";
        setSearch(nextSearch);
        setPage(1);
    }, [searchParams]);

    useEffect(() => {
        const taskId = searchParams.get("task");
        if (taskId) setDetailId(taskId);
    }, [searchParams]);

    useEffect(() => {
        if (searchParams.get("new") === "1") setFormOpen(true);
    }, [searchParams]);

    useEffect(() => {
        setPage(1);
    }, [deferredSearch, status, priority, due, assignee, projectId]);

    const clearFilters = () => {
        setSearch("");
        setStatus("");
        setPriority("");
        setDue("");
        setAssignee("");
        setProjectId("");
        setPage(1);
    };

    const hasFilters = Boolean(
        search || status || priority || due || assignee || projectId,
    );

    const closeDetail = () => {
        setDetailId(null);
        setEditing(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("task");
        const query = params.toString();
        router.replace(query ? `/tasks?${query}` : "/tasks");
    };

    const openDetail = (id: string) => {
        setDetailId(id);
    };

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (task: TaskDetail) => {
        setEditing(task);
        setFormOpen(true);
    };

    const onDropStatus = async (taskId: string, nextStatus: string) => {
        if (!canEdit) return;
        const task = data?.items.find((item) => item.id === taskId);
        if (!task || task.status === nextStatus) return;
        try {
            await updateTask({
                id: taskId,
                data: {status: nextStatus as TaskListItem["status"]},
            }).unwrap();
            toast.success(t("statusUpdated"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("statusError")));
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("countTotal", {
                    count: data?.pagination.total ?? 0,
                })}
                actions={
                    <>
                        <SegmentedControl
                            value={view}
                            onChange={setView}
                            items={[
                                {
                                    value: "list",
                                    label: tCommon("list"),
                                    icon: <List size={13} />,
                                },
                                {
                                    value: "kanban",
                                    label: tCommon("kanban"),
                                    icon: <Kanban size={13} />,
                                },
                            ]}
                        />
                        <Button onClick={openCreate} disabled={!canEdit}>
                            <Plus size={17} />
                            {t("createTask")}
                        </Button>
                    </>
                }
            />

            <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1">
                        <Search
                            size={15}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t("searchPlaceholder")}
                            className="pl-9"
                        />
                    </div>

                    <Select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        aria-label={tCommon("status")}
                        className="w-auto min-w-[130px]"
                    >
                        <option value="">
                            {t("statusFilter", {value: tCommon("all")})}
                        </option>
                        {taskStatuses.map((item) => (
                            <option key={item} value={item}>
                                {tStatus(item)}
                            </option>
                        ))}
                    </Select>

                    <Select
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                        aria-label={tCommon("priority")}
                        className="w-auto min-w-[130px]"
                    >
                        <option value="">
                            {t("priorityFilter", {value: tCommon("all")})}
                        </option>
                        {taskPriorities.map((item) => (
                            <option key={item} value={item}>
                                {tPriority(item)}
                            </option>
                        ))}
                    </Select>

                    <Select
                        value={due}
                        onChange={(event) => setDue(event.target.value)}
                        aria-label={tCommon("dueDate")}
                        className="w-auto min-w-[130px]"
                    >
                        <option value="">
                            {t("dueFilter", {value: tCommon("all")})}
                        </option>
                        <option value="overdue">{tCommon("overdue")}</option>
                        <option value="today">{tCommon("today")}</option>
                        <option value="week">{t("dueThisWeek")}</option>
                    </Select>

                    <Select
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        aria-label={tCommon("project")}
                        className="w-auto min-w-[140px] max-w-[200px]"
                    >
                        <option value="">
                            {t("projectFilter", {value: tCommon("all")})}
                        </option>
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                                {project.name}
                            </option>
                        ))}
                    </Select>

                    <Select
                        value={assignee}
                        onChange={(event) => setAssignee(event.target.value)}
                        aria-label={tCommon("assignee")}
                        className="w-auto min-w-[140px] max-w-[200px]"
                    >
                        <option value="">
                            {t("assigneeFilter", {value: tCommon("all")})}
                        </option>
                        {(membersData ?? []).map((member) => (
                            <option
                                key={member.user.id}
                                value={member.user.id}
                            >
                                {member.user.name}
                            </option>
                        ))}
                    </Select>

                    {hasFilters ? (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                            <FilterX size={14} />
                            {t("clearFilters")}
                        </Button>
                    ) : null}
                </div>
            </div>

            {isLoading ? (
                <div className="rounded-2xl border border-border bg-surface p-4">
                    <ListSkeleton rows={8} />
                </div>
            ) : (data?.items ?? []).length === 0 ? (
                <EmptyState
                    icon={<SquareCheck size={22} />}
                    title={hasFilters ? t("noResults") : t("emptyTitle")}
                    description={
                        hasFilters ? t("noResultsHint") : t("emptyDescription")
                    }
                    action={
                        canEdit && !hasFilters ? (
                            <Button onClick={openCreate}>
                                <Plus size={16} />
                                {t("createTask")}
                            </Button>
                        ) : hasFilters ? (
                            <Button variant="outline" onClick={clearFilters}>
                                {t("clearFilters")}
                            </Button>
                        ) : null
                    }
                />
            ) : view === "kanban" ? (
                <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                    {kanbanStatuses.map((column) => {
                        const items = (data?.items ?? []).filter(
                            (task) => task.status === column,
                        );
                        return (
                            <div
                                key={column}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    const taskId =
                                        event.dataTransfer.getData(
                                            "text/taskflow-task",
                                        );
                                    if (taskId)
                                        void onDropStatus(taskId, column);
                                }}
                                className="flex min-h-[240px] flex-col rounded-2xl border border-border bg-surface/70 p-2"
                            >
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                                        <span
                                            className={cn(
                                                "size-2 rounded-full",
                                                column === "completed"
                                                    ? "bg-success"
                                                    : column === "blocked"
                                                      ? "bg-error"
                                                      : column === "in_progress"
                                                        ? "bg-primary"
                                                        : column ===
                                                            "under_review"
                                                          ? "bg-warning"
                                                          : "bg-text-muted",
                                            )}
                                        />
                                        {tStatus(column)}
                                    </span>
                                    <span className="rounded-full bg-surface-hover px-1.5 text-[10px] tabular-nums text-text-muted">
                                        {items.length}
                                    </span>
                                </div>

                                <div className="flex flex-1 flex-col gap-2">
                                    {items.length === 0 ? (
                                        <p className="rounded-lg border border-dashed border-border px-2 py-6 text-center text-[11px] text-text-muted">
                                            {t("dropHere")}
                                        </p>
                                    ) : (
                                        items.map((task) => {
                                            const project =
                                                projectById.get(task.projectId);
                                            const person = task.assigneeId
                                                ? memberById.get(task.assigneeId)
                                                : null;
                                            const overdue = isOverdue(
                                                task.dueDate,
                                                task.status,
                                            );
                                            return (
                                                <button
                                                    key={task.id}
                                                    type="button"
                                                    draggable={canEdit}
                                                    onDragStart={(event) =>
                                                        event.dataTransfer.setData(
                                                            "text/taskflow-task",
                                                            task.id,
                                                        )
                                                    }
                                                    onClick={() =>
                                                        openDetail(task.id)
                                                    }
                                                    className="rounded-xl border border-border bg-surface p-2.5 text-left shadow-sm transition-shadow hover:shadow-md"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="line-clamp-2 text-xs font-semibold text-text-primary">
                                                            {task.title}
                                                        </p>
                                                        <Badge
                                                            tone={
                                                                priorityTone[
                                                                    task.priority
                                                                ]
                                                            }
                                                            className="shrink-0 px-1.5 text-[9px]"
                                                        >
                                                            {tPriority(
                                                                task.priority,
                                                            )}
                                                        </Badge>
                                                    </div>
                                                    {project ? (
                                                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-text-muted">
                                                            <span
                                                                className="size-1.5 rounded-full"
                                                                style={{
                                                                    backgroundColor:
                                                                        project.color,
                                                                }}
                                                            />
                                                            {project.name}
                                                        </p>
                                                    ) : null}
                                                    <div className="mt-2 flex items-center justify-between gap-1">
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center gap-1 text-[10px]",
                                                                overdue
                                                                    ? "text-error"
                                                                    : "text-text-muted",
                                                            )}
                                                        >
                                                            <CalendarClock
                                                                size={11}
                                                            />
                                                            {formatDate(
                                                                task.dueDate,
                                                                locale,
                                                            )}
                                                        </span>
                                                        {person ? (
                                                            <Avatar
                                                                name={
                                                                    person.name
                                                                }
                                                                src={
                                                                    person.avatarUrl
                                                                }
                                                                size="xs"
                                                            />
                                                        ) : null}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                    <div className="scroll-area max-h-[min(65dvh,680px)] overflow-auto overscroll-contain">
                        <table className="w-full min-w-[900px] border-collapse text-sm">
                            <thead className="sticky top-0 z-10 bg-surface-elevated shadow-[0_1px_0_var(--border)]">
                                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                                    <th className="px-4 py-3 font-medium">
                                        {t("tableTaskName")}
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        {t("tableProject")}
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        {t("tablePriority")}
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        {t("tableStatus")}
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        {t("tableDueDate")}
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        {t("tableAssignee")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.items ?? []).map((task) => {
                                    const project = projectById.get(
                                        task.projectId,
                                    );
                                    const person = task.assigneeId
                                        ? memberById.get(task.assigneeId)
                                        : null;
                                    const overdue = isOverdue(
                                        task.dueDate,
                                        task.status,
                                    );
                                    return (
                                        <tr
                                            key={task.id}
                                            onClick={() =>
                                                openDetail(task.id)
                                            }
                                            className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-hover/70"
                                        >
                                            <td className="max-w-[320px] px-4 py-3">
                                                <p className="truncate font-medium text-text-primary">
                                                    {task.title}
                                                </p>
                                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                                    {task.tags.map((tag) => (
                                                        <span
                                                            key={tag.id}
                                                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                                            style={{
                                                                backgroundColor: `${tag.color}14`,
                                                                color: tag.color,
                                                            }}
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                    {task.estimateMinutes ? (
                                                        <span className="text-[10px] text-text-muted">
                                                            {task.estimateMinutes}{" "}
                                                            min
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {project ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                                                        <span
                                                            className="size-2 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    project.color,
                                                            }}
                                                        />
                                                        {project.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge
                                                    tone={
                                                        priorityTone[
                                                            task.priority
                                                        ]
                                                    }
                                                >
                                                    {tPriority(task.priority)}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge
                                                    tone={
                                                        statusTone[task.status]
                                                    }
                                                >
                                                    {tStatus(task.status)}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center gap-1 text-xs",
                                                        overdue
                                                            ? "text-error"
                                                            : "text-text-secondary",
                                                    )}
                                                >
                                                    {overdue ? (
                                                        <CircleAlert
                                                            size={12}
                                                        />
                                                    ) : null}
                                                    {formatDate(
                                                        task.dueDate,
                                                        locale,
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {person ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <Avatar
                                                            name={person.name}
                                                            src={
                                                                person.avatarUrl
                                                            }
                                                            size="xs"
                                                        />
                                                        <span className="max-w-[120px] truncate text-xs text-text-secondary">
                                                            {person.name}
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">
                                                        {tCommon("unassigned")}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                        <p className="text-xs text-text-muted">
                            {tCommon("showingTasks", {
                                start:
                                    ((data?.pagination.page ?? 1) - 1) *
                                        (data?.pagination.pageSize ?? 12) +
                                    1,
                                end: Math.min(
                                    (data?.pagination.page ?? 1) *
                                        (data?.pagination.pageSize ?? 12),
                                    data?.pagination.total ?? 0,
                                ),
                                count: data?.pagination.total ?? 0,
                            })}
                            {isFetching ? " · …" : ""}
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">
                                {tCommon("pageOf", {
                                    page: data?.pagination.page ?? 1,
                                    pages: data?.pagination.pages ?? 1,
                                })}
                            </span>
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label={tCommon("previous")}
                                disabled={(data?.pagination.page ?? 1) <= 1}
                                onClick={() =>
                                    setPage(
                                        Math.max(
                                            1,
                                            (data?.pagination.page ?? 1) - 1,
                                        ),
                                    )
                                }
                            >
                                <ChevronLeft size={15} />
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label={tCommon("next")}
                                disabled={
                                    (data?.pagination.page ?? 1) >=
                                    (data?.pagination.pages ?? 1)
                                }
                                onClick={() =>
                                    setPage(
                                        Math.min(
                                            data?.pagination.pages ?? 1,
                                            (data?.pagination.page ?? 1) + 1,
                                        ),
                                    )
                                }
                            >
                                <ChevronRight size={15} />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <TaskFormDialog
                open={formOpen}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                    const params = new URLSearchParams(
                        searchParams.toString(),
                    );
                    params.delete("new");
                    const query = params.toString();
                    router.replace(query ? `/tasks?${query}` : "/tasks");
                }}
                task={editing}
                onSaved={(task) => setDetailId(task.id)}
            />

            <TaskDetailDialog
                taskId={detailId}
                open={Boolean(detailId)}
                onClose={closeDetail}
                onEdit={openEdit}
                onDeleted={closeDetail}
            />
        </div>
    );
}

export default function TasksPage() {
    return (
        <Suspense
            fallback={
                <div className="space-y-4">
                    <div className="h-10 w-64 animate-pulse rounded-lg bg-surface-hover" />
                    <ListSkeleton rows={8} />
                </div>
            }
        >
            <TasksPageContent />
        </Suspense>
    );
}
