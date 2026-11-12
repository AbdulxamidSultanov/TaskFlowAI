"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
    useTaskWorkflowMutation,
    useTaskParticipantsQuery,
} from "@/lib/redux/workflow-api";
import { getApiErrorMessage } from "@/lib/utils";
import type { TaskPermissions } from "@/lib/auth/task-rights";
import type {
    TaskActionRequest,
    WorkflowCommand,
} from "@/lib/task-workflow-types";
export function TaskActions({
    task,
    actorId,
}: {
    task: {
        id: string;
        status: string;
        archivedAt?: string | null;
        assigneeId: string | null;
        helperId?: string | null;
        requiresReview?: boolean;
        permissions?: TaskPermissions;
        actions?: TaskActionRequest[];
        actionRequests?: TaskActionRequest[];
    };
    actorId: string;
}) {
    const t = useTranslations("workflows");
    const [run, state] = useTaskWorkflowMutation();
    const toast = useToast();
    const [command, setCommand] = useState<WorkflowCommand | null>(null);
    const [reason, setReason] = useState("");
    const [target, setTarget] = useState("");
    const { data: participants } = useTaskParticipantsQuery(task.id, {
        skip: !command || !["block", "request"].includes(command.action),
    });
    const p = task.permissions;
    const closed =
        !!task.archivedAt || ["completed", "cancelled"].includes(task.status);
    const actions = task.actions ?? task.actionRequests ?? [];
    const open = (action: WorkflowCommand) => {
        setReason("");
        setTarget("");
        setCommand(action);
    };
    const execute = async (data: WorkflowCommand) => {
        try {
            await run({ id: task.id, data }).unwrap();
            setCommand(null);
            toast.success(t("saved"));
        } catch (e) {
            toast.error(getApiErrorMessage(e, t("error")));
        }
    };
    const needsReason =
        command &&
        ["block", "rework", "request", "resolve"].includes(command.action);
    if (!p || closed) return null;
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {task.assigneeId === actorId &&
                p.status &&
                !["blocked", "under_review"].includes(task.status) ? (
                    <Button
                        size="sm"
                        disabled={state.isLoading}
                        onClick={() => void execute({ action: "submit" })}
                    >
                        {t(task.requiresReview ? "submit" : "complete")}
                    </Button>
                ) : null}
                {task.status === "under_review" && p.review ? (
                    <>
                        <Button
                            size="sm"
                            disabled={state.isLoading}
                            onClick={() => void execute({ action: "accept" })}
                        >
                            {t("accept")}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => open({ action: "rework" })}
                        >
                            {t("rework")}
                        </Button>
                    </>
                ) : null}
                {task.status === "blocked" && p.unblock ? (
                    <Button
                        size="sm"
                        disabled={state.isLoading}
                        onClick={() => void execute({ action: "unblock" })}
                    >
                        {t("unblock")}
                    </Button>
                ) : null}
                {p.block && task.status !== "blocked" ? (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => open({ action: "block" })}
                    >
                        {t("block")}
                    </Button>
                ) : null}
                {p.delete ? (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => open({ action: "cancel" })}
                    >
                        {t("cancel")}
                    </Button>
                ) : null}
                {p.comment ? (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => open({ action: "request" })}
                    >
                        {t("request")}
                    </Button>
                ) : null}
                {actions
                    .filter((a) => a.kind === "response")
                    .map((a) => (
                        <Button
                            key={a.id}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                open({ action: "resolve", requestId: a.id })
                            }
                        >
                            {t("respond")}
                        </Button>
                    ))}
            </div>
            <Modal
                open={!!command}
                onClose={() => setCommand(null)}
                title={command ? t(command.action) : ""}
            >
                <div className="space-y-4">
                    {command &&
                    ["block", "request"].includes(command.action) ? (
                        <label className="block text-sm">
                            {t("helper")}
                            <Select
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                            >
                                <option value="">
                                    {t("defaultSupervisor")}
                                </option>
                                {task.assigneeId &&
                                task.assigneeId !== actorId ? (
                                    <option value={task.assigneeId}>
                                        {t("assignee")}
                                    </option>
                                ) : null}
                                {(participants ?? [])
                                    .filter(
                                        (p) =>
                                            p.role === "contributor" &&
                                            p.userId !== actorId &&
                                            p.userId !== task.assigneeId,
                                    )
                                    .map((p) => (
                                        <option key={p.userId} value={p.userId}>
                                            {p.name}
                                        </option>
                                    ))}
                            </Select>
                            <p className="mt-1 text-xs text-text-muted">
                                {t("helperHint")}
                            </p>
                        </label>
                    ) : null}
                    <label className="block text-sm">
                        {t("reason")}
                        <Textarea
                            value={reason}
                            maxLength={2000}
                            onChange={(e) => setReason(e.target.value)}
                            autoFocus
                        />
                    </label>
                    <Button
                        loading={state.isLoading}
                        disabled={Boolean(
                            needsReason && reason.trim().length < 3,
                        )}
                        onClick={() =>
                            command &&
                            void execute({
                                ...command,
                                reason: reason.trim(),
                                targetUserId: target || null,
                            })
                        }
                    >
                        {t("save")}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
