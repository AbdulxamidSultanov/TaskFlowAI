"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    CalendarDays,
    Clock,
    MessageSquare,
    Pencil,
    Send,
    Trash2,
} from "lucide-react";
import {useState} from "react";

import {Avatar} from "@/components/ui/avatar";
import {Badge, priorityTone, statusTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Select, Textarea} from "@/components/ui/input";
import {Modal, ConfirmDialog} from "@/components/ui/modal";
import {PageLoader} from "@/components/ui/states";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {taskStatuses} from "@/lib/domain";
import {
    useAddTaskCommentMutation,
    useDeleteTaskMutation,
    useGetTaskQuery,
    useGetWorkspaceMembersQuery,
    useUpdateTaskMutation,
} from "@/lib/redux/api";
import type {TaskDetail} from "@/lib/redux/types";
import {
    formatDate,
    formatDateTime,
    getApiErrorMessage,
} from "@/lib/utils";

export function TaskDetailDialog({
    taskId,
    open,
    onClose,
    onEdit,
    onDeleted,
}: {
    taskId: string | null;
    open: boolean;
    onClose: () => void;
    onEdit: (task: TaskDetail) => void;
    onDeleted: () => void;
}) {
    const t = useTranslations("taskDetail");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const tPriority = useTranslations("priority");
    const locale = useLocale();
    const toast = useToast();
    const {workspace, canEdit} = useWorkspace();

    const {data: task, isLoading} = useGetTaskQuery(
        {id: taskId ?? ""},
        {skip: !open || !taskId},
    );
    const {data: members} = useGetWorkspaceMembersQuery(
        {workspaceId: workspace.id},
        {skip: !open},
    );
    const [updateTask, updateState] = useUpdateTaskMutation();
    const [addComment, commentState] = useAddTaskCommentMutation();
    const [deleteTask, deleteState] = useDeleteTaskMutation();

    const [comment, setComment] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);

    const quickUpdate = async (data: Parameters<typeof updateTask>[0]["data"]) => {
        if (!task) return;
        try {
            await updateTask({id: task.id, data}).unwrap();
            toast.success(t("updated"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("updateError")));
        }
    };

    const submitComment = async () => {
        if (!task || comment.trim().length === 0) return;
        try {
            await addComment({
                taskId: task.id,
                data: {body: comment.trim()},
            }).unwrap();
            setComment("");
            toast.success(t("commentAdded"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("commentError")));
        }
    };

    const remove = async () => {
        if (!task) return;
        try {
            await deleteTask({id: task.id}).unwrap();
            toast.success(t("deleted"));
            setConfirmDelete(false);
            onDeleted();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("deleteError")));
        }
    };

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title={task?.title ?? t("loading")}
                description={
                    task
                        ? `${task.project.name} · ${task.project.key}`
                        : undefined
                }
                size="lg"
                closeLabel={tCommon("close")}
                footer={
                    task ? (
                        <>
                            {canEdit ? (
                                <>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => setConfirmDelete(true)}
                                    >
                                        <Trash2 size={15} />
                                        {t("delete")}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            onEdit(task as TaskDetail)
                                        }
                                    >
                                        <Pencil size={15} />
                                        {t("edit")}
                                    </Button>
                                </>
                            ) : null}
                            <Button size="sm" onClick={onClose}>
                                {tCommon("close")}
                            </Button>
                        </>
                    ) : null
                }
            >
                {isLoading || !task ? (
                    <PageLoader label={t("loading")} />
                ) : (
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={statusTone[task.status]}>
                                {tStatus(task.status)}
                            </Badge>
                            <Badge tone={priorityTone[task.priority]}>
                                {tPriority(task.priority)}
                            </Badge>
                            {task.tags.map((tag) => (
                                <span
                                    key={tag.id}
                                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                    style={{
                                        borderColor: `${tag.color}44`,
                                        backgroundColor: `${tag.color}14`,
                                        color: tag.color,
                                    }}
                                >
                                    {tag.name}
                                </span>
                            ))}
                        </div>

                        {task.description ? (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                                {task.description}
                            </p>
                        ) : (
                            <p className="text-sm italic text-text-muted">
                                {t("noDescription")}
                            </p>
                        )}

                        <div className="grid gap-3 rounded-xl border border-border bg-surface-elevated/60 p-3 sm:grid-cols-2">
                            <div className="flex items-center gap-2 text-sm">
                                <CalendarDays
                                    size={16}
                                    className="text-text-muted"
                                />
                                <span className="text-text-secondary">
                                    {t("dueDate")}:
                                </span>
                                <span className="text-text-primary">
                                    {formatDate(task.dueDate, locale)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <Clock size={16} className="text-text-muted" />
                                <span className="text-text-secondary">
                                    {t("estimate")}:
                                </span>
                                <span className="text-text-primary">
                                    {task.estimateMinutes
                                        ? tCommon("minutesShort", {
                                              count: task.estimateMinutes,
                                          })
                                        : "—"}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-text-secondary">
                                    {t("creator")}:
                                </span>
                                <Avatar
                                    name={task.creator.name}
                                    src={task.creator.avatarUrl}
                                    size="xs"
                                />
                                <span className="text-text-primary">
                                    {task.creator.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-text-secondary">
                                    {t("created")}:
                                </span>
                                <span className="text-text-primary">
                                    {formatDateTime(task.createdAt, locale)}
                                </span>
                            </div>
                        </div>

                        {canEdit ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-xs font-medium text-text-secondary">
                                    {t("status")}
                                    <Select
                                        className="mt-1"
                                        value={task.status}
                                        disabled={updateState.isLoading}
                                        onChange={(event) =>
                                            void quickUpdate({
                                                status: event.target
                                                    .value as TaskDetail["status"],
                                            })
                                        }
                                    >
                                        {taskStatuses.map((status) => (
                                            <option key={status} value={status}>
                                                {tStatus(status)}
                                            </option>
                                        ))}
                                    </Select>
                                </label>
                                <label className="text-xs font-medium text-text-secondary">
                                    {t("assignee")}
                                    <Select
                                        className="mt-1"
                                        value={task.assigneeId ?? ""}
                                        disabled={updateState.isLoading}
                                        onChange={(event) =>
                                            void quickUpdate({
                                                assigneeId:
                                                    event.target.value || null,
                                            })
                                        }
                                    >
                                        <option value="">
                                            {tCommon("unassigned")}
                                        </option>
                                        {(members ?? []).map((member) => (
                                            <option
                                                key={member.user.id}
                                                value={member.user.id}
                                            >
                                                {member.user.name}
                                            </option>
                                        ))}
                                    </Select>
                                </label>
                            </div>
                        ) : null}

                        <div>
                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                                <MessageSquare size={16} />
                                {t("comments")}
                                <span className="rounded-full bg-surface-hover px-2 text-[10px] text-text-muted">
                                    {task.comments.length}
                                </span>
                            </h3>

                            <div className="space-y-3">
                                {task.comments.length === 0 ? (
                                    <p className="text-sm text-text-muted">
                                        {t("noComments")}
                                    </p>
                                ) : (
                                    task.comments.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex gap-2.5"
                                        >
                                            <Avatar
                                                name={item.author.name}
                                                src={item.author.avatarUrl}
                                                size="sm"
                                            />
                                            <div className="min-w-0 flex-1 rounded-xl bg-surface-elevated/70 px-3 py-2">
                                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                                    <p className="text-xs font-semibold text-text-primary">
                                                        {item.author.name}
                                                    </p>
                                                    <p className="text-[10px] text-text-muted">
                                                        {formatDateTime(
                                                            item.createdAt,
                                                            locale,
                                                        )}
                                                    </p>
                                                </div>
                                                <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                                                    {item.body}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {canEdit ? (
                                <div className="mt-3 flex items-end gap-2">
                                    <Textarea
                                        value={comment}
                                        onChange={(event) =>
                                            setComment(event.target.value)
                                        }
                                        placeholder={t("commentPlaceholder")}
                                        className="min-h-10 flex-1 py-2"
                                        rows={1}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === "Enter" &&
                                                (event.metaKey ||
                                                    event.ctrlKey)
                                            ) {
                                                void submitComment();
                                            }
                                        }}
                                    />
                                    <Button
                                        size="icon"
                                        aria-label={t("send")}
                                        loading={commentState.isLoading}
                                        disabled={!comment.trim()}
                                        onClick={() => void submitComment()}
                                    >
                                        <Send size={16} />
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmDialog
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title={t("deleteTitle")}
                description={t("deleteDescription")}
                confirmLabel={t("delete")}
                cancelLabel={tCommon("cancel")}
                loading={deleteState.isLoading}
                onConfirm={() => void remove()}
            />
        </>
    );
}
