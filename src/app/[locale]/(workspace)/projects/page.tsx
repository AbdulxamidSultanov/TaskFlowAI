"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    CalendarDays,
    FolderKanban,
    Pencil,
    Plus,
    Search,
    Trash2,
    Users,
} from "lucide-react";
import {useSearchParams} from "next/navigation";
import {Suspense, useDeferredValue, useEffect, useMemo, useState} from "react";

import {ProjectFormDialog} from "@/components/projects/project-form-dialog";
import {Avatar} from "@/components/ui/avatar";
import {Badge, projectTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input, Select} from "@/components/ui/input";
import {PageHeader, StatCard} from "@/components/ui/layout";
import {ConfirmDialog} from "@/components/ui/modal";
import {EmptyState, ListSkeleton} from "@/components/ui/states";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link, useRouter} from "@/i18n/navigation";
import {projectStatuses} from "@/lib/domain";
import {
    useDeleteProjectMutation,
    useGetDepartmentsQuery,
    useGetProjectsQuery,
} from "@/lib/redux/api";
import type {Project} from "@/lib/redux/types";
import {formatDate, getApiErrorMessage, isOverdue} from "@/lib/utils";

function ProjectsPageContent() {
    const t = useTranslations("projects");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("projectStatus");
    const locale = useLocale();
    const router = useRouter();
    const toast = useToast();
    const searchParams = useSearchParams();
    const {workspace, canEdit} = useWorkspace();

    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [status, setStatus] = useState("");
    const [departmentId, setDepartmentId] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Project | null>(null);
    const [deleting, setDeleting] = useState<Project | null>(null);

    const {data: departments} = useGetDepartmentsQuery();
    const {data, isLoading} = useGetProjectsQuery({
        workspaceId: workspace.id,
        search: deferredSearch.trim() || undefined,
        status: (status || undefined) as Project["status"] | undefined,
        departmentId: departmentId || undefined,
        pageSize: 100,
    });
    const [deleteProject, deleteState] = useDeleteProjectMutation();

    useEffect(() => {
        if (searchParams.get("new") === "1" && canEdit) {
            setEditing(null);
            setFormOpen(true);
            router.replace("/projects");
        }
    }, [searchParams, canEdit, router]);

    const projects = useMemo(() => data?.items ?? [], [data?.items]);

    const counts = useMemo(
        () => ({
            total: data?.pagination.total ?? 0,
            active: projects.filter((item) => item.status === "active").length,
            completed: projects.filter((item) => item.status === "completed")
                .length,
            tasks: projects.reduce((sum, item) => sum + item.taskCount, 0),
        }),
        [projects, data?.pagination.total],
    );

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const remove = async () => {
        if (!deleting) return;
        try {
            await deleteProject({id: deleting.id}).unwrap();
            toast.success(t("deleted"));
            setDeleting(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("deleteError")));
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description", {count: counts.total})}
                actions={
                    <Button onClick={openCreate} disabled={!canEdit}>
                        <Plus size={17} />
                        {t("create")}
                    </Button>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t("totalProjects")}
                    value={counts.total}
                    icon={<FolderKanban size={17} />}
                />
                <StatCard
                    label={t("activeProjects")}
                    value={counts.active}
                    tone="success"
                />
                <StatCard
                    label={t("completedProjects")}
                    value={counts.completed}
                    tone="info"
                />
                <StatCard
                    label={t("totalTasks")}
                    value={counts.tasks}
                    tone="warning"
                />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
                <div className="relative min-w-[220px] flex-1">
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
                    className="w-auto min-w-[140px]"
                    aria-label={tCommon("status")}
                >
                    <option value="">
                        {t("allStatuses")}
                    </option>
                    {projectStatuses.map((item) => (
                        <option key={item} value={item}>
                            {tStatus(item)}
                        </option>
                    ))}
                </Select>
                <Select
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    className="w-auto min-w-[150px]"
                    aria-label={t("department")}
                >
                    <option value="">{t("allDepartments")}</option>
                    {(departments ?? []).map((department) => (
                        <option key={department.id} value={department.id}>
                            {department.name}
                        </option>
                    ))}
                </Select>
            </div>

            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({length: 6}, (_, index) => (
                        <div
                            key={index}
                            className="h-48 animate-pulse rounded-2xl border border-border bg-surface"
                        />
                    ))}
                </div>
            ) : projects.length === 0 ? (
                <EmptyState
                    icon={<FolderKanban size={22} />}
                    title={t("emptyTitle")}
                    description={t("emptyDescription")}
                    action={
                        canEdit ? (
                            <Button onClick={openCreate}>
                                <Plus size={16} />
                                {t("create")}
                            </Button>
                        ) : null
                    }
                />
            ) : (
                <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                    <div className="scroll-area grid max-h-[min(72dvh,860px)] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                    {projects.map((project) => {
                        const overdue =
                            project.dueDate &&
                            project.status === "active" &&
                            isOverdue(project.dueDate, project.status);
                        return (
                            <div
                                key={project.id}
                                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <div
                                    className="absolute inset-x-0 top-0 h-1"
                                    style={{
                                        backgroundColor: project.color,
                                    }}
                                />
                                <Link
                                    href={`/projects/${project.id}`}
                                    className="min-w-0 flex-1"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-text-primary group-hover:text-primary">
                                                {project.name}
                                            </p>
                                            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                                                {project.key} ·{" "}
                                                {project.department.name}
                                            </p>
                                        </div>
                                        <Badge
                                            tone={projectTone[project.status]}
                                        >
                                            {tStatus(project.status)}
                                        </Badge>
                                    </div>

                                    <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-text-secondary">
                                        {project.description ??
                                            t("noDescription")}
                                    </p>

                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
                                        <span className="inline-flex items-center gap-1">
                                            <FolderKanban size={12} />
                                            {t("taskCount", {
                                                count: project.taskCount,
                                            })}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <CalendarDays size={12} />
                                            {formatDate(
                                                project.dueDate,
                                                locale,
                                            )}
                                        </span>
                                    </div>
                                </Link>

                                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        {project.owner ? (
                                            <>
                                                <Avatar
                                                    name={project.owner.name}
                                                    src={
                                                        project.owner.avatarUrl
                                                    }
                                                    size="xs"
                                                />
                                                <span className="max-w-[140px] truncate text-[11px] text-text-secondary">
                                                    {project.owner.name}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                                                <Users size={12} />
                                                {t("noOwner")}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex shrink-0 items-center gap-0.5">
                                        {overdue ? (
                                            <Badge tone="danger">
                                                {tCommon("overdue")}
                                            </Badge>
                                        ) : null}
                                        {canEdit ? (
                                            <>
                                                <button
                                                    type="button"
                                                    aria-label={t("edit")}
                                                    onClick={() => {
                                                        setEditing(project);
                                                        setFormOpen(true);
                                                    }}
                                                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-primary"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={t("delete")}
                                                    onClick={() =>
                                                        setDeleting(project)
                                                    }
                                                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>
            )}

            <ProjectFormDialog
                open={formOpen}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                project={editing}
            />

            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={t("deleteTitle")}
                description={t("deleteDescription", {
                    name: deleting?.name ?? "",
                })}
                confirmLabel={t("delete")}
                cancelLabel={tCommon("cancel")}
                loading={deleteState.isLoading}
                onConfirm={() => void remove()}
            />
        </div>
    );
}

export default function ProjectsPage() {
    return (
        <Suspense
            fallback={
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <ListSkeleton rows={6} />
                </div>
            }
        >
            <ProjectsPageContent />
        </Suspense>
    );
}
