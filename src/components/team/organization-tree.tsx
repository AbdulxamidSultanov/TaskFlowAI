"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { taskflowApi, useGetTasksQuery } from "@/lib/redux/api";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
type Person = {
    id: string;
    name: string;
    jobTitle: string | null;
    managerUserId: string | null;
    accessScope: "self" | "team" | "workspace";
    role: string;
    completed: number;
    overdue: number;
};
const orgApi = taskflowApi.injectEndpoints({
    endpoints: (b) => ({
        getOrganization: b.query<Person[], string>({
            query: (workspaceId) => ({
                url: "/organization",
                params: { workspaceId },
            }),
            transformResponse: (r: { data: Person[] }) => r.data,
            providesTags: ["WorkspaceMember", "Task"],
        }),
        updateOrganization: b.mutation<
            unknown,
            {
                workspaceId: string;
                userId: string;
                managerUserId: string | null;
                accessScope: Person["accessScope"];
            }
        >({
            query: (body) => ({ url: "/organization", method: "PATCH", body }),
            invalidatesTags: [
                "WorkspaceMember",
                "User",
                "Task",
                "Project",
                "Analytics",
            ],
        }),
    }),
});
export function OrganizationTree() {
    const t = useTranslations("organization");
    const { workspace, canManageWorkspace } = useWorkspace();
    const toast = useToast();
    const {
        data: people,
        isError,
        refetch,
    } = orgApi.useGetOrganizationQuery(workspace.id);
    const [update, state] = orgApi.useUpdateOrganizationMutation();
    const [selected, setSelected] = useState<string | null>(null);
    const person = people?.find((p) => p.id === selected);
    const [search, setSearch] = useState("");
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const { data: personTasks } = useGetTasksQuery(
        {
            workspaceId: workspace.id,
            assigneeId: selected ?? undefined,
            pageSize: 20,
        },
        { skip: !selected },
    );
    const visible = useMemo(() => {
        if (!search.trim()) return null;
        const ids = new Set<string>();
        const q = search.trim().toLowerCase();
        for (const person of people ?? [])
            if (
                `${person.name} ${person.jobTitle ?? ""}`
                    .toLowerCase()
                    .includes(q)
            ) {
                let cursor: Person | undefined = person;
                const seen = new Set<string>();
                while (cursor && !seen.has(cursor.id)) {
                    seen.add(cursor.id);
                    ids.add(cursor.id);
                    cursor = people?.find(
                        (p) => p.id === cursor?.managerUserId,
                    );
                }
            }
        return ids;
    }, [people, search]);
    async function save(p: Person, patch: Partial<Person>) {
        try {
            await update({
                workspaceId: workspace.id,
                userId: p.id,
                managerUserId: p.managerUserId,
                accessScope: p.accessScope,
                ...patch,
            }).unwrap();
        } catch (e) {
            toast.error(getApiErrorMessage(e, t("error")));
        }
    }
    function branch(p: Person, seen: Set<string>) {
        if (seen.has(p.id) || (visible && !visible.has(p.id))) return null;
        const next = new Set([...seen, p.id]);
        const children =
            people?.filter((child) => child.managerUserId === p.id) ?? [];
        return (
            <li key={p.id} className="relative min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    {children.length ? (
                        <button
                            className="shrink-0 rounded p-2 text-text-secondary"
                            aria-label={t(
                                collapsed.has(p.id) ? "expand" : "collapse",
                            )}
                            aria-expanded={
                                !collapsed.has(p.id) || Boolean(search)
                            }
                            onClick={() =>
                                setCollapsed((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(p.id)) next.delete(p.id);
                                    else next.add(p.id);
                                    return next;
                                })
                            }
                        >
                            {collapsed.has(p.id) && !search ? "+" : "−"}
                        </button>
                    ) : null}
                    <button
                        onClick={() => setSelected(p.id)}
                        title={`${t("completed")}: ${p.completed}; ${t("overdue")}: ${p.overdue}`}
                        className="my-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-primary"
                    >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                            {p.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 break-words">
                            <span className="block text-sm font-medium">
                                {p.name}
                            </span>
                            <span className="block text-xs text-text-muted">
                                {p.jobTitle ?? t("employee")}
                            </span>
                            <span className="block text-xs">
                                {t("completed")}: {p.completed} · {t("overdue")}
                                : {p.overdue}
                            </span>
                        </span>
                    </button>
                </div>
                {children.length && (!collapsed.has(p.id) || search) ? (
                    <ul className="ml-2 border-l border-border pl-2 sm:ml-6 sm:pl-6">
                        {children.map((child) => branch(child, next))}
                    </ul>
                ) : null}
            </li>
        );
    }
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">{t("title")}</h2>
            <p className="mt-1 text-sm text-text-secondary">
                {t("description")}
            </p>
            {isError ? (
                <Button onClick={() => void refetch()}>{t("retry")}</Button>
            ) : null}
            <Input
                aria-label={t("search")}
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mt-3"
            />
            <ul className="mt-4">
                {people
                    ?.filter(
                        (p) =>
                            !p.managerUserId ||
                            !people.some(
                                (parent) => parent.id === p.managerUserId,
                            ),
                    )
                    .map((p) => branch(p, new Set()))}
            </ul>
            {person ? (
                <div className="mt-4 rounded-xl border border-border p-4">
                    <h3 className="font-semibold">{person.name}</h3>
                    <p className="mt-1 text-sm">{person.jobTitle}</p>
                    <p className="mt-2 text-xs text-text-muted">
                        {t("violationsUnavailable")}
                    </p>
                    <h4 className="mt-4 text-sm font-semibold">{t("tasks")}</h4>
                    <ul className="my-2 space-y-2 text-sm">
                        {personTasks?.items.map((task) => (
                            <li key={task.id}>
                                <Link
                                    className="break-words text-primary underline"
                                    href={`/tasks?task=${encodeURIComponent(task.id)}`}
                                >
                                    {task.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {canManageWorkspace ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="text-sm">
                                {t("manager")}
                                <Select
                                    disabled={
                                        state.isLoading ||
                                        person.role === "owner"
                                    }
                                    value={person.managerUserId ?? ""}
                                    onChange={(e) =>
                                        void save(person, {
                                            managerUserId:
                                                e.target.value || null,
                                        })
                                    }
                                >
                                    <option value="">{t("noManager")}</option>
                                    {people
                                        ?.filter((p) => p.id !== person.id)
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                </Select>
                            </label>
                            <label className="text-sm">
                                {t("scope")}
                                <Select
                                    disabled={
                                        state.isLoading ||
                                        ["owner", "admin"].includes(person.role)
                                    }
                                    value={person.accessScope}
                                    onChange={(e) =>
                                        void save(person, {
                                            accessScope: e.target
                                                .value as Person["accessScope"],
                                        })
                                    }
                                >
                                    {["self", "team", "workspace"].map((s) => (
                                        <option key={s} value={s}>
                                            {t(s)}
                                        </option>
                                    ))}
                                </Select>
                            </label>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
