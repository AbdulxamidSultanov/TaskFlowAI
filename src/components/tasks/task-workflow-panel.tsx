"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { TaskActions } from "@/components/day-board/task-actions";
import {
    useTaskCandidatesQuery,
    useTaskParticipantsQuery,
    useChangeParticipantMutation,
} from "@/lib/redux/workflow-api";
import { useUpdateTaskMutation } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
import type { TaskDetail } from "@/lib/redux/types";
export function TaskWorkflowPanel({ task }: { task: TaskDetail }) {
    const t = useTranslations("workflows");
    const locale = useLocale();
    const { user } = useWorkspace();
    const toast = useToast();
    const p = task.permissions;
    const {
        data: participants,
        isError,
        refetch,
    } = useTaskParticipantsQuery(task.id);
    const { data: candidates } = useTaskCandidatesQuery(task.id, {
        skip: !p?.manageParticipants,
    });
    const [change, state] = useChangeParticipantMutation();
    const [update, updateState] = useUpdateTaskMutation();
    const [target, setTarget] = useState("");
    const [role, setRole] = useState<"viewer" | "contributor">("viewer");
    const fail = (e: unknown) => toast.error(getApiErrorMessage(e, t("error")));
    return (
        <section className="space-y-4 rounded-xl border border-border bg-surface-elevated/40 p-3">
            <TaskActions task={task} actorId={user.id} />
            {task.status === "blocked" ? (
                <div className="rounded-lg bg-error/5 p-3 text-sm">
                    <p>
                        {t("blockReason")}:{" "}
                        {task.blockReason ?? t("missingReason")}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                        {task.blockedAt
                            ? new Date(task.blockedAt).toLocaleString(locale)
                            : ""}{" "}
                        · {t("blockAuthor")}: {task.blockedBy?.name ?? "—"} ·{" "}
                        {t("helper")}: {task.helper?.name ?? "—"}
                    </p>
                </div>
            ) : null}
            {task.submittedAt ? (
                <p className="text-xs text-text-muted">
                    {t("submitted")}:{" "}
                    {new Date(task.submittedAt).toLocaleString(locale)}
                </p>
            ) : null}
            {task.reviewedAt ? (
                <p className="text-xs text-text-muted">
                    {t("accepted")}:{" "}
                    {new Date(task.reviewedAt).toLocaleString(locale)}
                </p>
            ) : null}
            {p?.manageParticipants ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={task.requiresReview ?? false}
                            disabled={
                                updateState.isLoading ||
                                task.status === "under_review"
                            }
                            onChange={(e) =>
                                void update({
                                    id: task.id,
                                    data: { requiresReview: e.target.checked },
                                })
                                    .unwrap()
                                    .catch(fail)
                            }
                        />
                        {t("requiresReview")}
                    </label>
                    {
                        <label className="min-w-0 flex-1">
                            {t("reviewer")}
                            <Select
                                value={task.reviewerId ?? ""}
                                disabled={
                                    updateState.isLoading ||
                                    task.status === "under_review"
                                }
                                onChange={(e) =>
                                    void update({
                                        id: task.id,
                                        data: {
                                            reviewerId: e.target.value || null,
                                        },
                                    })
                                        .unwrap()
                                        .catch(fail)
                                }
                            >
                                <option value="">
                                    {t("defaultSupervisor")}
                                </option>
                                {candidates
                                    ?.filter((c) => c.id !== task.assigneeId)
                                    .map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                            </Select>
                        </label>
                    }
                </div>
            ) : task.requiresReview ? (
                <p className="text-xs">{t("requiresReview")}</p>
            ) : null}
            <div>
                <h3 className="text-sm font-semibold">{t("participants")}</h3>
                <p className="mt-1 text-xs text-text-muted">
                    {t("participantsHint")}
                </p>
                {isError ? (
                    <Button size="sm" onClick={() => void refetch()}>
                        {t("retry")}
                    </Button>
                ) : null}
                <ul className="my-3 space-y-2">
                    {participants?.map((person) => (
                        <li
                            key={person.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                            <span>
                                {person.name} · {person.department ?? "—"} ·{" "}
                                {t(person.role)}
                            </span>
                            {p?.manageParticipants ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={state.isLoading}
                                    onClick={() =>
                                        void change({
                                            id: task.id,
                                            userId: person.userId,
                                        })
                                            .unwrap()
                                            .catch(fail)
                                    }
                                >
                                    {t("remove")}
                                </Button>
                            ) : null}
                        </li>
                    ))}
                </ul>
                {!participants?.length && !isError ? (
                    <p className="my-2 text-xs text-text-muted">
                        {t("noParticipants")}
                    </p>
                ) : null}
                {p?.manageParticipants ? (
                    <div className="flex flex-wrap gap-2">
                        <Select
                            className="min-w-0 flex-1"
                            aria-label={t("participant")}
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                        >
                            <option value="">{t("chooseParticipant")}</option>
                            {candidates?.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} · {c.department ?? "—"}
                                </option>
                            ))}
                        </Select>
                        <Select
                            className="w-auto"
                            aria-label={t("participantRole")}
                            value={role}
                            onChange={(e) =>
                                setRole(e.target.value as typeof role)
                            }
                        >
                            <option value="viewer">{t("viewer")}</option>
                            <option value="contributor">
                                {t("contributor")}
                            </option>
                        </Select>
                        <Button
                            size="sm"
                            disabled={!target || state.isLoading}
                            onClick={() =>
                                void change({
                                    id: task.id,
                                    userId: target,
                                    role,
                                })
                                    .unwrap()
                                    .then(() => setTarget(""))
                                    .catch(fail)
                            }
                        >
                            {t("add")}
                        </Button>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
