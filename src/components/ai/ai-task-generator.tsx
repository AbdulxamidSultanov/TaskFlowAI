"use client";

import {useTranslations} from "next-intl";
import {
    AlertTriangle,
    Check,
    Loader2,
    RefreshCw,
    Sparkles,
    Trash2,
    Wand2,
} from "lucide-react";
import {useMemo, useState} from "react";

import {Badge, priorityTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input, Select, Textarea} from "@/components/ui/input";
import {Card} from "@/components/ui/layout";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {taskPriorities} from "@/lib/domain";
import {
    useGetAiTaskDraftsQuery,
    useGetProjectsQuery,
    useGetWorkspaceMembersQuery,
    useGenerateAiTasksMutation,
    usePublishAiTaskDraftsMutation,
    useRejectAiTaskDraftMutation,
    useUpdateAiTaskDraftMutation,
} from "@/lib/redux/api";
import type {AiTaskDraft, AiTaskDraftUpdateInput} from "@/lib/redux/types";
import {cn, getApiErrorMessage} from "@/lib/utils";

const MAX_PROMPT = 2000;

export function AiTaskGenerator() {
    const t = useTranslations("aiGenerator");
    const toast = useToast();
    const {workspace, canEdit} = useWorkspace();

    const [prompt, setPrompt] = useState("");
    const [projectFilter, setProjectFilter] = useState("");
    const [error, setError] = useState("");
    const [lastMode, setLastMode] = useState<"ai" | "mock" | null>(null);

    const {data, isLoading, isFetching} = useGetAiTaskDraftsQuery(
        {workspaceId: workspace.id},
    );
    const {data: projectsData} = useGetProjectsQuery({
        workspaceId: workspace.id,
        pageSize: 100,
    });
    const {data: members} = useGetWorkspaceMembersQuery({
        workspaceId: workspace.id,
    });

    const [generate, generateState] = useGenerateAiTasksMutation();
    const [updateDraft, updateState] = useUpdateAiTaskDraftMutation();
    const [rejectDraft, rejectState] = useRejectAiTaskDraftMutation();
    const [publish, publishState] = usePublishAiTaskDraftsMutation();

    const projects = useMemo(
        () => projectsData?.items ?? [],
        [projectsData],
    );
    const departments = useMemo(() => {
        const map = new Map<string, {id: string; name: string; color: string}>();
        for (const project of projects) {
            map.set(project.department.id, {
                id: project.department.id,
                name: project.department.name,
                color: project.department.color,
            });
        }
        return [...map.values()];
    }, [projects]);

    const drafts = data?.tasks ?? [];
    const configured = data?.configured ?? false;
    const savingId = updateState.isLoading
        ? updateState.originalArgs?.id
        : undefined;
    const busy =
        generateState.isLoading ||
        publishState.isLoading ||
        rejectState.isLoading;

    const submit = async (nextPrompt = prompt) => {
        const value = nextPrompt.trim();
        if (!value || busy) return;
        setError("");
        try {
            const result = await generate({
                workspaceId: workspace.id,
                prompt: value,
                projectId: projectFilter || null,
            }).unwrap();
            setLastMode(result.mode);
            if (result.mode === "mock") {
                toast.info(t("mockToast"));
            } else {
                toast.success(t("generated", {count: result.tasks.length}));
            }
        } catch (submitError) {
            setError(getApiErrorMessage(submitError, t("generateError")));
        }
    };

    const save = async (id: string, patch: AiTaskDraftUpdateInput) => {
        try {
            await updateDraft({id, data: patch}).unwrap();
        } catch (saveError) {
            toast.error(getApiErrorMessage(saveError, t("saveError")));
        }
    };

    const reject = async (id: string) => {
        try {
            await rejectDraft({id}).unwrap();
            toast.success(t("rejected"));
        } catch (rejectError) {
            toast.error(getApiErrorMessage(rejectError, t("rejectError")));
        }
    };

    const confirmAll = async () => {
        if (drafts.length === 0 || publishState.isLoading) return;
        try {
            const result = await publish({
                workspaceId: workspace.id,
                draftIds: drafts.map((draft) => draft.id),
            }).unwrap();
            toast.success(t("published", {count: result.published.length}));
        } catch (publishError) {
            toast.error(getApiErrorMessage(publishError, t("publishError")));
        }
    };

    return (
        <Card className="overflow-hidden p-0!">
            <div className="border-b border-border bg-gradient-to-r from-indigo-600/10 via-transparent to-violet-600/10 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="flex size-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <Wand2 size={16} />
                            </span>
                            <h2 className="text-sm font-semibold text-text-primary">
                                {t("title")}
                            </h2>
                            <Badge
                                tone={configured ? "success" : "warning"}
                            >
                                {configured ? t("liveMode") : t("mockMode")}
                            </Badge>
                        </div>
                        <p className="mt-1.5 max-w-2xl text-xs text-text-secondary">
                            {t("description")}
                        </p>
                    </div>
                    {drafts.length > 0 ? (
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void submit()}
                                disabled={busy || !canEdit}
                                loading={generateState.isLoading}
                            >
                                <RefreshCw size={14} />
                                {t("regenerate")}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => void confirmAll()}
                                disabled={busy || !canEdit}
                                loading={publishState.isLoading}
                            >
                                <Check size={14} />
                                {t("confirmAll")}
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="space-y-3 border-b border-border p-5">
                <Textarea
                    value={prompt}
                    onChange={(event) =>
                        setPrompt(event.target.value.slice(0, MAX_PROMPT))
                    }
                    placeholder={t("promptPlaceholder")}
                    rows={3}
                    maxLength={MAX_PROMPT}
                    disabled={busy || !canEdit}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPrompt(t("examplePrompt"))}
                            disabled={busy || !canEdit}
                        >
                            {t("useExample")}
                        </Button>
                        <Select
                            value={projectFilter}
                            onChange={(event) =>
                                setProjectFilter(event.target.value)
                            }
                            aria-label={t("projectFilter")}
                            className="w-auto min-w-[170px]"
                            disabled={busy}
                        >
                            <option value="">{t("allProjects")}</option>
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                        <span className="text-[10px] text-text-muted">
                            {prompt.length}/{MAX_PROMPT}
                        </span>
                    </div>
                    <Button
                        onClick={() => void submit()}
                        disabled={
                            busy || !canEdit || prompt.trim().length < 8
                        }
                        loading={generateState.isLoading}
                    >
                        {generateState.isLoading ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <Sparkles size={15} />
                        )}
                        {generateState.isLoading
                            ? t("generating")
                            : t("generate")}
                    </Button>
                </div>

                {!configured ? (
                    <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        {t("mockHint")}
                    </p>
                ) : null}

                {error ? (
                    <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">{error}</span>
                    </div>
                ) : null}
            </div>

            <div className="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {t("draftsTitle")}
                        {drafts.length > 0 ? (
                            <span className="ml-1.5 rounded-full bg-surface-hover px-1.5 text-[10px] tabular-nums">
                                {drafts.length}
                            </span>
                        ) : null}
                    </p>
                    {lastMode ? (
                        <Badge tone={lastMode === "ai" ? "accent" : "neutral"}>
                            {lastMode === "ai"
                                ? t("generatedByAi")
                                : t("generatedByMock")}
                        </Badge>
                    ) : null}
                </div>

                {isLoading && drafts.length === 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="h-40 animate-pulse rounded-xl bg-surface-hover" />
                        <div className="h-40 animate-pulse rounded-xl bg-surface-hover" />
                    </div>
                ) : drafts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                        <Sparkles
                            size={22}
                            className="mx-auto mb-2 text-text-muted"
                        />
                        <p className="text-sm font-medium text-text-primary">
                            {t("emptyTitle")}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                            {t("emptyDescription")}
                        </p>
                    </div>
                ) : (
                    <div className="scroll-area max-h-[min(70dvh,760px)] space-y-3 overflow-y-auto pr-1">
                        {drafts.map((draft, index) => (
                            <DraftCard
                                key={draft.id}
                                draft={draft}
                                index={index}
                                projects={projects}
                                departments={departments}
                                members={members ?? []}
                                disabled={busy || !canEdit}
                                saving={savingId === draft.id}
                                onSave={save}
                                onReject={reject}
                            />
                        ))}
                    </div>
                )}

                {isFetching && !isLoading ? (
                    <p className="mt-2 text-[10px] text-text-muted">
                        {t("refreshing")}
                    </p>
                ) : null}
            </div>
        </Card>
    );
}

function DraftCard({
    draft,
    index,
    projects,
    departments,
    members,
    disabled,
    saving,
    onSave,
    onReject,
}: {
    draft: AiTaskDraft;
    index: number;
    projects: Array<{
        id: string;
        name: string;
        department: {id: string; name: string; color: string};
    }>;
    departments: Array<{id: string; name: string; color: string}>;
    members: Array<{
        id: string;
        user: {id: string; name: string; avatarUrl: string | null};
    }>;
    disabled: boolean;
    saving: boolean;
    onSave: (id: string, patch: AiTaskDraftUpdateInput) => Promise<void>;
    onReject: (id: string) => Promise<void>;
}) {
    const t = useTranslations("aiGenerator");
    const tPriority = useTranslations("priority");

    return (
        <div
            className={cn(
                "rounded-xl border border-border bg-surface-elevated/40 p-3",
                saving && "opacity-70",
            )}
        >
            <div className="mb-2 flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">
                    {index + 1}
                </span>
                <Badge tone={priorityTone[draft.priority]}>
                    {tPriority(draft.priority)}
                </Badge>
                <span className="ml-auto text-[10px] text-text-muted">
                    {saving ? t("saving") : t("draftLabel")}
                </span>
                <button
                    type="button"
                    onClick={() => void onReject(draft.id)}
                    disabled={disabled}
                    aria-label={t("reject")}
                    title={t("reject")}
                    className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            <div className="space-y-2.5">
                <Input
                    defaultValue={draft.title}
                    maxLength={240}
                    disabled={disabled}
                    aria-label={t("titleLabel")}
                    onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value.length >= 2 && value !== draft.title) {
                            void onSave(draft.id, {title: value});
                        }
                    }}
                />
                <Textarea
                    defaultValue={draft.description ?? ""}
                    rows={2}
                    maxLength={2000}
                    disabled={disabled}
                    aria-label={t("descriptionLabel")}
                    placeholder={t("descriptionPlaceholder")}
                    onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (draft.description ?? "")) {
                            void onSave(draft.id, {
                                description: value || null,
                            });
                        }
                    }}
                />

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-1 text-[10px] text-text-muted">
                        <span>{t("project")}</span>
                        <Select
                            value={draft.projectId ?? ""}
                            disabled={disabled}
                            onChange={(event) =>
                                void onSave(draft.id, {
                                    projectId: event.target.value,
                                })
                            }
                        >
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="space-y-1 text-[10px] text-text-muted">
                        <span>{t("department")}</span>
                        <Select
                            value={draft.departmentId ?? ""}
                            disabled={disabled}
                            onChange={(event) =>
                                void onSave(draft.id, {
                                    departmentId: event.target.value,
                                })
                            }
                        >
                            {departments.map((department) => (
                                <option
                                    key={department.id}
                                    value={department.id}
                                >
                                    {department.name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="space-y-1 text-[10px] text-text-muted">
                        <span>{t("assignee")}</span>
                        <Select
                            value={draft.suggestedAssigneeId ?? ""}
                            disabled={disabled}
                            onChange={(event) =>
                                void onSave(draft.id, {
                                    suggestedAssigneeId:
                                        event.target.value || null,
                                })
                            }
                        >
                            <option value="">{t("unassigned")}</option>
                            {members.map((member) => (
                                <option
                                    key={member.user.id}
                                    value={member.user.id}
                                >
                                    {member.user.name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="space-y-1 text-[10px] text-text-muted">
                        <span>{t("deadline")}</span>
                        <Input
                            type="date"
                            defaultValue={
                                draft.suggestedDeadline?.slice(0, 10) ?? ""
                            }
                            disabled={disabled}
                            onChange={(event) =>
                                void onSave(draft.id, {
                                    suggestedDeadline:
                                        event.target.value || null,
                                })
                            }
                        />
                    </label>
                    <label className="space-y-1 text-[10px] text-text-muted">
                        <span>{t("priority")}</span>
                        <Select
                            value={draft.priority}
                            disabled={disabled}
                            onChange={(event) =>
                                void onSave(draft.id, {
                                    priority: event.target
                                        .value as AiTaskDraft["priority"],
                                })
                            }
                        >
                            {taskPriorities.map((priority) => (
                                <option key={priority} value={priority}>
                                    {tPriority(priority)}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="space-y-1 text-[10px] text-text-muted">
                        <span>{t("estimate")}</span>
                        <Input
                            type="number"
                            min={0}
                            max={10000}
                            defaultValue={draft.estimateMinutes ?? ""}
                            disabled={disabled}
                            onBlur={(event) =>
                                void onSave(draft.id, {
                                    estimateMinutes: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                })
                            }
                        />
                    </label>
                </div>
            </div>
        </div>
    );
}
