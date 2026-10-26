"use client";

import {useTranslations} from "next-intl";
import {useEffect, useMemo, useState} from "react";

import {Button} from "@/components/ui/button";
import {Field, Input, Select, Textarea} from "@/components/ui/input";
import {Modal} from "@/components/ui/modal";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {taskPriorities, taskStatuses} from "@/lib/domain";
import {
    useCreateTaskMutation,
    useGetProjectsQuery,
    useGetTagsQuery,
    useGetWorkspaceMembersQuery,
    useUpdateTaskMutation,
} from "@/lib/redux/api";
import type {TaskCreateInput, TaskDetail, TaskListItem} from "@/lib/redux/types";
import {
    dateInputToIso,
    getApiErrorMessage,
    toDateInputValue,
} from "@/lib/utils";

type EditableTask = Pick<
    TaskDetail,
    | "id"
    | "title"
    | "description"
    | "projectId"
    | "status"
    | "priority"
    | "assigneeId"
    | "startDate"
    | "dueDate"
    | "estimateMinutes"
> & {
    tags?: Array<{id: string; name: string; color: string}>;
};

export function TaskFormDialog({
    open,
    onClose,
    task = null,
    defaultStatus,
    defaultProjectId,
    defaultDueDate,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    task?: EditableTask | TaskDetail | TaskListItem | null;
    defaultStatus?: (typeof taskStatuses)[number];
    defaultProjectId?: string;
    defaultDueDate?: string;
    onSaved?: (task: TaskDetail) => void;
}) {
    const t = useTranslations("taskForm");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const tPriority = useTranslations("priority");
    const toast = useToast();
    const {workspace, canEdit} = useWorkspace();

    const {data: projectsData} = useGetProjectsQuery(
        {workspaceId: workspace.id, pageSize: 100},
        {skip: !open},
    );
    const {data: members} = useGetWorkspaceMembersQuery(
        {workspaceId: workspace.id},
        {skip: !open},
    );
    const {data: tags} = useGetTagsQuery(
        {workspaceId: workspace.id},
        {skip: !open},
    );

    const [createTask, createState] = useCreateTaskMutation();
    const [updateTask, updateState] = useUpdateTaskMutation();
    const saving = createState.isLoading || updateState.isLoading;

    const projects = useMemo(() => projectsData?.items ?? [], [projectsData]);
    const isEdit = Boolean(task?.id);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [projectId, setProjectId] = useState("");
    const [status, setStatus] = useState<(typeof taskStatuses)[number]>(
        defaultStatus ?? "todo",
    );
    const [priority, setPriority] =
        useState<(typeof taskPriorities)[number]>("medium");
    const [assigneeId, setAssigneeId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [estimate, setEstimate] = useState("");
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        setErrors({});
        if (task) {
            setTitle(task.title);
            setDescription(task.description ?? "");
            setProjectId(task.projectId);
            setStatus(task.status);
            setPriority(task.priority);
            setAssigneeId(task.assigneeId ?? "");
            setStartDate(toDateInputValue(task.startDate));
            setDueDate(toDateInputValue(task.dueDate));
            setEstimate(
                task.estimateMinutes ? String(task.estimateMinutes) : "",
            );
            setTagIds(task.tags?.map((tag) => tag.id) ?? []);
        } else {
            setTitle("");
            setDescription("");
            setProjectId(defaultProjectId ?? projects[0]?.id ?? "");
            setStatus(defaultStatus ?? "todo");
            setPriority("medium");
            setAssigneeId("");
            setStartDate("");
            setDueDate(defaultDueDate ?? "");
            setEstimate("");
            setTagIds([]);
        }
        // Only reset when the dialog opens or the edited task changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, task?.id]);

    useEffect(() => {
        if (open && !projectId && projects.length > 0) {
            setProjectId(defaultProjectId ?? projects[0].id);
        }
    }, [open, projectId, projects, defaultProjectId]);

    const selectedTags = useMemo(
        () => new Set(tagIds),
        [tagIds],
    );

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (title.trim().length < 2) {
            nextErrors.title = t("titleRequired");
        }
        if (!projectId) {
            nextErrors.project = t("projectRequired");
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        const payload: TaskCreateInput = {
            projectId,
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            assigneeId: assigneeId || null,
            startDate: dateInputToIso(startDate),
            dueDate: dateInputToIso(dueDate, true),
            estimateMinutes: estimate ? Number(estimate) : null,
            tagIds,
        };

        try {
            let saved: TaskDetail;
            if (task?.id) {
                saved = await updateTask({
                    id: task.id,
                    data: payload,
                }).unwrap();
                toast.success(t("updated"));
            } else {
                saved = await createTask(payload).unwrap();
                toast.success(t("created"));
            }
            onSaved?.(saved);
            onClose();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("saveError")));
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={isEdit ? t("editTitle") : t("createTitle")}
            description={isEdit ? t("editDescription") : t("createDescription")}
            size="lg"
            closeLabel={tCommon("close")}
            footer={
                <>
                    <Button variant="outline" onClick={onClose}>
                        {tCommon("cancel")}
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        loading={saving}
                        disabled={!canEdit || projects.length === 0}
                    >
                        {isEdit ? tCommon("saveChanges") : tCommon("createTask")}
                    </Button>
                </>
            }
        >
            {projects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                    <p className="text-sm font-medium text-text-primary">
                        {t("noProjectsTitle")}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                        {t("noProjectsDescription")}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                        className="sm:col-span-2"
                        label={t("title")}
                        htmlFor="task-title"
                        required
                        error={errors.title}
                    >
                        <Input
                            id="task-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder={t("titlePlaceholder")}
                            maxLength={240}
                            autoFocus
                        />
                    </Field>

                    <Field
                        className="sm:col-span-2"
                        label={t("description")}
                        htmlFor="task-description"
                    >
                        <Textarea
                            id="task-description"
                            value={description}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            placeholder={t("descriptionPlaceholder")}
                            maxLength={8000}
                        />
                    </Field>

                    <Field
                        label={t("project")}
                        htmlFor="task-project"
                        required
                        error={errors.project}
                    >
                        <Select
                            id="task-project"
                            value={projectId}
                            onChange={(event) =>
                                setProjectId(event.target.value)
                            }
                        >
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name} · {project.key}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label={t("assignee")} htmlFor="task-assignee">
                        <Select
                            id="task-assignee"
                            value={assigneeId}
                            onChange={(event) =>
                                setAssigneeId(event.target.value)
                            }
                        >
                            <option value="">{tCommon("unassigned")}</option>
                            {(members ?? []).map((member) => (
                                <option
                                    key={member.user.id}
                                    value={member.user.id}
                                >
                                    {member.user.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label={t("status")} htmlFor="task-status">
                        <Select
                            id="task-status"
                            value={status}
                            onChange={(event) =>
                                setStatus(
                                    event.target
                                        .value as (typeof taskStatuses)[number],
                                )
                            }
                        >
                            {taskStatuses.map((item) => (
                                <option key={item} value={item}>
                                    {tStatus(item)}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label={t("priority")} htmlFor="task-priority">
                        <Select
                            id="task-priority"
                            value={priority}
                            onChange={(event) =>
                                setPriority(
                                    event.target
                                        .value as (typeof taskPriorities)[number],
                                )
                            }
                        >
                            {taskPriorities.map((item) => (
                                <option key={item} value={item}>
                                    {tPriority(item)}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label={t("startDate")} htmlFor="task-start">
                        <Input
                            id="task-start"
                            type="date"
                            value={startDate}
                            onChange={(event) =>
                                setStartDate(event.target.value)
                            }
                        />
                    </Field>

                    <Field label={t("dueDate")} htmlFor="task-due">
                        <Input
                            id="task-due"
                            type="date"
                            value={dueDate}
                            onChange={(event) =>
                                setDueDate(event.target.value)
                            }
                        />
                    </Field>

                    <Field
                        label={t("estimate")}
                        htmlFor="task-estimate"
                        hint={t("estimateHint")}
                    >
                        <Input
                            id="task-estimate"
                            type="number"
                            min={0}
                            step={15}
                            value={estimate}
                            onChange={(event) =>
                                setEstimate(event.target.value)
                            }
                            placeholder="60"
                        />
                    </Field>

                    <Field className="sm:col-span-2" label={t("tags")}>
                        {(tags ?? []).length === 0 ? (
                            <p className="text-xs text-text-muted">
                                {t("noTags")}
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {(tags ?? []).map((tag) => {
                                    const active = selectedTags.has(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() =>
                                                setTagIds((current) =>
                                                    current.includes(tag.id)
                                                        ? current.filter(
                                                              (id) =>
                                                                  id !== tag.id,
                                                          )
                                                        : [...current, tag.id],
                                                )
                                            }
                                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                                            style={{
                                                borderColor: active
                                                    ? tag.color
                                                    : "var(--border)",
                                                backgroundColor: active
                                                    ? `${tag.color}1f`
                                                    : "transparent",
                                                color: active
                                                    ? tag.color
                                                    : "var(--text-secondary)",
                                            }}
                                        >
                                            <span
                                                className="size-1.5 rounded-full"
                                                style={{
                                                    backgroundColor: tag.color,
                                                }}
                                            />
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Field>

                    {task?.id ? (
                        <p className="text-xs text-text-muted sm:col-span-2">
                            {t("editMeta")}
                        </p>
                    ) : null}
                </div>
            )}
        </Modal>
    );
}
