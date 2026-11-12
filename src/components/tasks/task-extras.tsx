"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
    taskflowApi,
    useGetTasksQuery,
    useUpdateTaskMutation,
} from "@/lib/redux/api";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
type Extras = {
    activity: {
        id: string;
        action: string;
        changes: string;
        createdAt: string;
        actor: string | null;
    }[];
    dependencies: { id: string; title: string; status: string }[];
};
const api = taskflowApi.injectEndpoints({
    endpoints: (b) => ({
        getExtras: b.query<Extras, string>({
            query: (id) => `/tasks/${encodeURIComponent(id)}/activity`,
            transformResponse: (r: { data: Extras }) => r.data,
            providesTags: ["Task"],
        }),
        setDependency: b.mutation<
            void,
            { id: string; dependsOnId: string; remove?: boolean }
        >({
            query: ({ id, dependsOnId, remove }) => ({
                url: `/tasks/${encodeURIComponent(id)}/dependencies${remove ? `?dependsOnId=${encodeURIComponent(dependsOnId)}` : ""}`,
                method: remove ? "DELETE" : "POST",
                ...(!remove ? { body: { dependsOnId } } : {}),
            }),
            invalidatesTags: ["Task"],
        }),
    }),
});
export function TaskExtras({
    taskId,
    archivedAt,
}: {
    taskId: string;
    archivedAt: string | null;
}) {
    const t = useTranslations("taskExtras");
    const locale = useLocale();
    const toast = useToast();
    const { workspace, canEdit } = useWorkspace();
    const { data } = api.useGetExtrasQuery(taskId);
    const { data: tasks } = useGetTasksQuery({
        workspaceId: workspace.id,
        pageSize: 100,
    });
    const [dependency, setDependency] = useState("");
    const [change, state] = api.useSetDependencyMutation();
    const [update, updateState] = useUpdateTaskMutation();
    const fail = (e: unknown) => toast.error(getApiErrorMessage(e, t("error")));
    return (
        <section className="space-y-3 border-t border-border pt-4">
            {archivedAt && canEdit ? (
                <Button
                    loading={updateState.isLoading}
                    onClick={() =>
                        void update({ id: taskId, data: { archived: false } })
                            .unwrap()
                            .catch(fail)
                    }
                >
                    {t("restore")}
                </Button>
            ) : null}
            <h3 className="text-sm font-semibold">{t("dependencies")}</h3>
            <p className="text-xs text-text-muted">{t("dependencyHint")}</p>
            <ul className="space-y-2">
                {data?.dependencies.map((d) => (
                    <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 text-sm"
                    >
                        <span>
                            {d.title} {d.status === "completed" ? "✓" : ""}
                        </span>
                        {canEdit ? (
                            <button
                                className="text-xs text-error"
                                disabled={state.isLoading}
                                onClick={() =>
                                    void change({
                                        id: taskId,
                                        dependsOnId: d.id,
                                        remove: true,
                                    })
                                        .unwrap()
                                        .catch(fail)
                                }
                            >
                                {t("remove")}
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
            {canEdit && !archivedAt ? (
                <div className="flex gap-2">
                    <Select
                        aria-label={t("dependencies")}
                        value={dependency}
                        onChange={(e) => setDependency(e.target.value)}
                    >
                        <option value="">{t("selectDependency")}</option>
                        {tasks?.items
                            .filter(
                                (task) =>
                                    task.id !== taskId &&
                                    !data?.dependencies.some(
                                        (d) => d.id === task.id,
                                    ),
                            )
                            .map((task) => (
                                <option key={task.id} value={task.id}>
                                    {task.title}
                                </option>
                            ))}
                    </Select>
                    <Button
                        disabled={!dependency || state.isLoading}
                        onClick={() =>
                            void change({ id: taskId, dependsOnId: dependency })
                                .unwrap()
                                .then(() => setDependency(""))
                                .catch(fail)
                        }
                    >
                        {t("add")}
                    </Button>
                </div>
            ) : null}
            <details>
                <summary className="cursor-pointer text-sm font-semibold">
                    {t("history")}
                </summary>
                <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">
                    {data?.activity.map((a) => (
                        <li
                            key={a.id}
                            className="border-l border-border pl-3 text-xs"
                        >
                            <p>
                                {t.has(
                                    `actions.${a.action.replaceAll(".", "_")}`,
                                )
                                    ? t(
                                          `actions.${a.action.replaceAll(".", "_")}`,
                                      )
                                    : a.action}{" "}
                                · {a.actor ?? t("system")}
                            </p>
                            <time className="text-text-muted">
                                {new Date(a.createdAt).toLocaleString(locale)}
                            </time>
                        </li>
                    ))}
                </ul>
            </details>
        </section>
    );
}
