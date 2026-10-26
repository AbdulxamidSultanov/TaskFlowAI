"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    ListChecks,
    Pencil,
    Plus,
    Trash2,
    UserRound,
} from "lucide-react";
import {useParams} from "next/navigation";
import {useMemo, useState} from "react";

import {ProjectFormDialog} from "@/components/projects/project-form-dialog";
import {TaskFormDialog} from "@/components/tasks/task-form-dialog";
import {Avatar} from "@/components/ui/avatar";
import {Badge, priorityTone, projectTone, statusTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {PageHeader, ProgressBar, StatCard} from "@/components/ui/layout";
import {ConfirmDialog} from "@/components/ui/modal";
import {EmptyState, PageLoader} from "@/components/ui/states";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link, useRouter} from "@/i18n/navigation";
import {
    useDeleteProjectMutation,
    useGetProjectQuery,
    useGetWorkspaceMembersQuery,
} from "@/lib/redux/api";
import {
    formatDate,
    getApiErrorMessage,
    isOverdue,
} from "@/lib/utils";

export default function ProjectDetailPage() {
    const t = useTranslations("projectDetail");
    const tProjects = useTranslations("projects");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const tProjectStatus = useTranslations("projectStatus");
    const tPriority = useTranslations("priority");
    const locale = useLocale();
    const params = useParams<{id: string}>();
    const router = useRouter();
    const toast = useToast();
    const {canEdit} = useWorkspace();

    const {data: project, isLoading, isError} = useGetProjectQuery({
        id: params.id,
    });
    const {data: membersData} = useGetWorkspaceMembersQuery(
        {workspaceId: project?.workspaceId ?? ""},
        {skip: !project?.workspaceId},
    );
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
    const [deleteProject, deleteState] = useDeleteProjectMutation();

    const [editOpen, setEditOpen] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const remove = async () => {
        if (!project) return;
        try {
            await deleteProject({id: project.id}).unwrap();
            toast.success(tProjects("deleted"));
            setConfirmDelete(false);
            router.push("/projects");
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("deleteError")));
        }
    };

    if (isLoading) {
        return <PageLoader label={tCommon("loading")} />;
    }

    if (isError || !project) {
        return (
            <EmptyState
                title={t("notFoundTitle")}
                description={t("notFoundDescription")}
                action={
                    <Link
                        href="/projects"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white"
                    >
                        <ArrowLeft size={15} />
                        {t("backToProjects")}
                    </Link>
                }
            />
        );
    }

    const completed = project.tasks.filter(
        (task) => task.status === "completed",
    ).length;
    const progress =
        project.tasks.length > 0
            ? Math.round((completed / project.tasks.length) * 100)
            : 0;

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/projects"
                    className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-primary"
                >
                    <ArrowLeft size={14} />
                    {t("backToProjects")}
                </Link>

                <PageHeader
                    eyebrow={`${project.key} · ${project.department.name}`}
                    title={project.name}
                    description={project.description ?? undefined}
                    actions={
                        <>
                            {canEdit ? (
                                <>
                                    <Button
                                        variant="outline"
                                        size="md"
                                        onClick={() => setEditOpen(true)}
                                    >
                                        <Pencil size={15} />
                                        {t("editProject")}
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="md"
                                        onClick={() => setConfirmDelete(true)}
                                    >
                                        <Trash2 size={15} />
                                        {t("deleteProject")}
                                    </Button>
                                    <Button onClick={() => setTaskOpen(true)}>
                                        <Plus size={16} />
                                        {tCommon("newTask")}
                                    </Button>
                                </>
                            ) : null}
                        </>
                    }
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={projectTone[project.status]}>
                    {tProjectStatus(project.status)}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                    <UserRound size={13} />
                    {project.owner?.name ?? t("noOwner")}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                    <CalendarDays size={13} />
                    {project.startDate
                        ? `${formatDate(project.startDate, locale)} — `
                        : ""}
                    {formatDate(project.dueDate, locale)}
                </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                    label={t("totalTasks")}
                    value={project.tasks.length}
                    icon={<ListChecks size={17} />}
                />
                <StatCard
                    label={t("completedTasks")}
                    value={completed}
                    icon={<CheckCircle2 size={17} />}
                    tone="success"
                />
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        {t("progress")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
                        {progress}%
                    </p>
                    <ProgressBar
                        value={progress}
                        tone={progress >= 70 ? "success" : "primary"}
                        className="mt-2"
                    />
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold text-text-primary">
                        {t("tasks")}
                    </h2>
                    <span className="text-xs text-text-muted">
                        {project.tasks.length}
                    </span>
                </div>

                {project.tasks.length === 0 ? (
                    <div className="p-4">
                        <EmptyState
                            icon={<ListChecks size={20} />}
                            title={t("noTasksTitle")}
                            description={t("noTasksDescription")}
                            action={
                                canEdit ? (
                                    <Button onClick={() => setTaskOpen(true)}>
                                        <Plus size={16} />
                                        {tCommon("newTask")}
                                    </Button>
                                ) : null
                            }
                        />
                    </div>
                ) : (
                    <div className="scroll-area max-h-[min(60dvh,560px)] divide-y divide-border overflow-y-auto">
                        {project.tasks.map((task) => {
                            const overdue = isOverdue(
                                task.dueDate,
                                task.status,
                            );
                            return (
                                <button
                                    key={task.id}
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/tasks?task=${encodeURIComponent(task.id)}`,
                                        )
                                    }
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
                                >
                                    <span
                                        className={`size-2 shrink-0 rounded-full ${
                                            task.status === "completed"
                                                ? "bg-success"
                                                : task.status === "blocked"
                                                  ? "bg-error"
                                                  : "bg-primary"
                                        }`}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                                        {task.title}
                                    </span>
                                    <Badge
                                        tone={priorityTone[task.priority]}
                                        className="hidden sm:inline-flex"
                                    >
                                        {tPriority(task.priority)}
                                    </Badge>
                                    <Badge tone={statusTone[task.status]}>
                                        {tStatus(task.status)}
                                    </Badge>
                                    <span
                                        className={`hidden w-24 text-right text-[11px] sm:block ${
                                            overdue
                                                ? "text-error"
                                                : "text-text-muted"
                                        }`}
                                    >
                                        {formatDate(task.dueDate, locale)}
                                    </span>
                                    {task.assigneeId ? (
                                        <Avatar
                                            name={
                                                memberById.get(
                                                    task.assigneeId,
                                                )?.name ?? "—"
                                            }
                                            src={
                                                memberById.get(
                                                    task.assigneeId,
                                                )?.avatarUrl
                                            }
                                            size="xs"
                                        />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <ProjectFormDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                project={project}
            />

            <TaskFormDialog
                open={taskOpen}
                onClose={() => setTaskOpen(false)}
                defaultProjectId={project.id}
            />

            <ConfirmDialog
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title={t("deleteTitle")}
                description={t("deleteDescription", {name: project.name})}
                confirmLabel={t("deleteProject")}
                cancelLabel={tCommon("cancel")}
                loading={deleteState.isLoading}
                onConfirm={() => void remove()}
            />
        </div>
    );
}
