"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    Building2,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    Search,
    Trash2,
    UserPlus,
    UserRound,
    Users,
} from "lucide-react";
import {useDeferredValue, useState} from "react";

import {DepartmentFormDialog} from "@/components/team/department-form-dialog";
import {MemberFormDialog} from "@/components/team/member-form-dialog";
import {UserFormDialog} from "@/components/team/user-form-dialog";
import {Avatar} from "@/components/ui/avatar";
import {Badge, roleTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input, Select} from "@/components/ui/input";
import {PageHeader, StatCard} from "@/components/ui/layout";
import {ConfirmDialog} from "@/components/ui/modal";
import {EmptyState, ListSkeleton} from "@/components/ui/states";
import {Tabs} from "@/components/ui/tabs";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {userRoles, workspaceRoles} from "@/lib/domain";
import {
    useDeleteDepartmentMutation,
    useDeleteUserMutation,
    useGetDepartmentsQuery,
    useGetUsersQuery,
    useGetWorkspaceMembersQuery,
    useRemoveWorkspaceMemberMutation,
    useUpdateWorkspaceMemberMutation,
} from "@/lib/redux/api";
import type {DepartmentWithCounts, User} from "@/lib/redux/types";
import {formatDate, getApiErrorMessage} from "@/lib/utils";

type TabValue = "members" | "people" | "departments";

export default function TeamPage() {
    const t = useTranslations("team");
    const tCommon = useTranslations("common");
    const tRole = useTranslations("role");
    const tWsRole = useTranslations("workspaceRole");
    const locale = useLocale();
    const {user, workspace, canManageWorkspace, canManageUsers, canManageDepartments} =
        useWorkspace();

    const [tab, setTab] = useState<TabValue>("members");
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [roleFilter, setRoleFilter] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("");
    const [page, setPage] = useState(1);

    const [memberOpen, setMemberOpen] = useState(false);
    const [userOpen, setUserOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [departmentOpen, setDepartmentOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] =
        useState<DepartmentWithCounts | null>(null);
    const [removingMember, setRemovingMember] = useState<{
        userId: string;
        name: string;
    } | null>(null);
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [deletingDepartment, setDeletingDepartment] =
        useState<DepartmentWithCounts | null>(null);

    const toast = useToast();

    const {data: members, isLoading: membersLoading} =
        useGetWorkspaceMembersQuery({workspaceId: workspace.id});
    const {data: departments, isLoading: departmentsLoading} =
        useGetDepartmentsQuery();
    const {data: usersData, isLoading: usersLoading} = useGetUsersQuery({
        search: deferredSearch.trim() || undefined,
        role: (roleFilter || undefined) as User["role"] | undefined,
        departmentId: departmentFilter || undefined,
        page,
        pageSize: 10,
    });

    const [updateMember] = useUpdateWorkspaceMemberMutation();
    const [removeMember, removeState] = useRemoveWorkspaceMemberMutation();
    const [deleteUser, deleteUserState] = useDeleteUserMutation();
    const [deleteDepartment, deleteDepartmentState] =
        useDeleteDepartmentMutation();

    const users = usersData?.items ?? [];

    const tabs = [
        {
            value: "members" as const,
            label: t("tabMembers"),
            count: members?.length ?? 0,
        },
        ...(canManageUsers
            ? [
                  {
                      value: "people" as const,
                      label: t("tabPeople"),
                      count: usersData?.pagination.total ?? 0,
                  },
              ]
            : []),
        {
            value: "departments" as const,
            label: t("tabDepartments"),
            count: departments?.length ?? 0,
        },
    ];

    const changeRole = async (userId: string, role: string) => {
        try {
            await updateMember({
                workspaceId: workspace.id,
                userId,
                role: role as (typeof workspaceRoles)[number],
            }).unwrap();
            toast.success(t("memberRoleUpdated"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("memberRoleError")));
        }
    };

    const confirmRemoveMember = async () => {
        if (!removingMember) return;
        try {
            await removeMember({
                workspaceId: workspace.id,
                userId: removingMember.userId,
            }).unwrap();
            toast.success(t("memberRemoved"));
            setRemovingMember(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("memberRemoveError")));
        }
    };

    const confirmDeleteUser = async () => {
        if (!deletingUser) return;
        try {
            await deleteUser({id: deletingUser.id}).unwrap();
            toast.success(t("userDeleted"));
            setDeletingUser(null);
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("userDeleteError")));
        }
    };

    const confirmDeleteDepartment = async () => {
        if (!deletingDepartment) return;
        try {
            await deleteDepartment({id: deletingDepartment.id}).unwrap();
            toast.success(t("departmentDeleted"));
            setDeletingDepartment(null);
        } catch (error) {
            toast.error(
                getApiErrorMessage(error, t("departmentDeleteError")),
            );
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description", {workspace: workspace.name})}
                actions={
                    <>
                        {tab === "members" && canManageWorkspace ? (
                            <Button onClick={() => setMemberOpen(true)}>
                                <UserPlus size={16} />
                                {t("addMember")}
                            </Button>
                        ) : null}
                        {tab === "people" && canManageUsers ? (
                            <Button
                                onClick={() => {
                                    setEditingUser(null);
                                    setUserOpen(true);
                                }}
                            >
                                <Plus size={16} />
                                {t("addUser")}
                            </Button>
                        ) : null}
                        {tab === "departments" && canManageDepartments ? (
                            <Button
                                onClick={() => {
                                    setEditingDepartment(null);
                                    setDepartmentOpen(true);
                                }}
                            >
                                <Plus size={16} />
                                {t("addDepartment")}
                            </Button>
                        ) : null}
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                    label={t("workspaceMembers")}
                    value={members?.length ?? 0}
                    icon={<Users size={17} />}
                />
                <StatCard
                    label={t("organizationUsers")}
                    value={usersData?.pagination.total ?? 0}
                    icon={<UserRound size={17} />}
                    tone="info"
                />
                <StatCard
                    label={t("departments")}
                    value={departments?.length ?? 0}
                    icon={<Building2 size={17} />}
                    tone="success"
                />
            </div>

            <Tabs
                value={tab}
                onChange={(value) => {
                    setTab(value);
                    setPage(1);
                }}
                items={tabs}
            />

            {tab === "members" ? (
                membersLoading ? (
                    <ListSkeleton rows={6} />
                ) : (members ?? []).length === 0 ? (
                    <EmptyState
                        icon={<Users size={22} />}
                        title={t("noMembersTitle")}
                        description={t("noMembersDescription")}
                    />
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                        <div className="scroll-area max-h-[min(65dvh,640px)] divide-y divide-border overflow-y-auto">
                            {(members ?? []).map((member) => {
                                const isSelf = member.user.id === user.id;
                                return (
                                    <div
                                        key={member.id}
                                        className="flex flex-wrap items-center gap-3 px-4 py-3"
                                    >
                                        <Avatar
                                            name={member.user.name}
                                            src={member.user.avatarUrl}
                                            size="md"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 truncate text-sm font-semibold text-text-primary">
                                                {member.user.name}
                                                {isSelf ? (
                                                    <Badge tone="neutral">
                                                        {tCommon("you")}
                                                    </Badge>
                                                ) : null}
                                            </p>
                                            <p className="truncate text-xs text-text-muted">
                                                {member.user.jobTitle ??
                                                    member.user.email}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            {canManageWorkspace &&
                                            !isSelf &&
                                            member.role !== "owner" ? (
                                                <Select
                                                    value={member.role}
                                                    onChange={(event) =>
                                                        void changeRole(
                                                            member.user.id,
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="h-8 w-auto min-w-[110px] text-xs"
                                                    aria-label={t(
                                                        "changeRole",
                                                    )}
                                                >
                                                    {workspaceRoles
                                                        .filter(
                                                            (item) =>
                                                                item !==
                                                                "owner",
                                                        )
                                                        .map((item) => (
                                                            <option
                                                                key={item}
                                                                value={item}
                                                            >
                                                                {tWsRole(item)}
                                                            </option>
                                                        ))}
                                                </Select>
                                            ) : (
                                                <Badge
                                                    tone={roleTone[member.role]}
                                                >
                                                    {tWsRole(member.role)}
                                                </Badge>
                                            )}

                                            {canManageWorkspace &&
                                            !isSelf &&
                                            member.role !== "owner" ? (
                                                <button
                                                    type="button"
                                                    aria-label={t(
                                                        "removeMember",
                                                    )}
                                                    title={t("removeMember")}
                                                    onClick={() =>
                                                        setRemovingMember({
                                                            userId:
                                                                member.user.id,
                                                            name: member.user
                                                                .name,
                                                        })
                                                    }
                                                    className="flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-error/10 hover:text-error"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            ) : null}

            {tab === "people" ? (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3">
                        <div className="relative min-w-[220px] flex-1">
                            <Search
                                size={15}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                            />
                            <Input
                                value={search}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }}
                                placeholder={t("searchUsers")}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={roleFilter}
                            onChange={(event) => {
                                setRoleFilter(event.target.value);
                                setPage(1);
                            }}
                            className="w-auto min-w-[130px]"
                            aria-label={t("role")}
                        >
                            <option value="">{t("allRoles")}</option>
                            {userRoles.map((role) => (
                                <option key={role} value={role}>
                                    {tRole(role)}
                                </option>
                            ))}
                        </Select>
                        <Select
                            value={departmentFilter}
                            onChange={(event) => {
                                setDepartmentFilter(event.target.value);
                                setPage(1);
                            }}
                            className="w-auto min-w-[150px]"
                            aria-label={t("department")}
                        >
                            <option value="">{t("allDepartments")}</option>
                            {(departments ?? []).map((department) => (
                                <option
                                    key={department.id}
                                    value={department.id}
                                >
                                    {department.name}
                                </option>
                            ))}
                        </Select>
                    </div>

                    {usersLoading ? (
                        <ListSkeleton rows={8} />
                    ) : users.length === 0 ? (
                        <EmptyState
                            icon={<UserRound size={22} />}
                            title={t("noUsersTitle")}
                            description={t("noUsersDescription")}
                        />
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                            <div className="scroll-area max-h-[min(65dvh,640px)] overflow-auto">
                                <table className="w-full min-w-[760px] border-collapse text-sm">
                                    <thead className="sticky top-0 z-10 bg-surface-elevated shadow-[0_1px_0_var(--border)]">
                                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
                                            <th className="px-4 py-3 font-medium">
                                                {t("user")}
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                {t("role")}
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                {t("department")}
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                {t("status")}
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                {t("joined")}
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                {tCommon("actions")}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((item) => (
                                            <tr
                                                key={item.id}
                                                className="border-b border-border/60 last:border-0"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <Avatar
                                                            name={item.name}
                                                            src={item.avatarUrl}
                                                            size="sm"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium text-text-primary">
                                                                {item.name}
                                                            </p>
                                                            <p className="truncate text-[11px] text-text-muted">
                                                                {item.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge tone="primary">
                                                        {tRole(item.role)}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-text-secondary">
                                                    {item.department?.name ??
                                                        t("noDepartment")}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Badge
                                                        tone={
                                                            item.isActive
                                                                ? "success"
                                                                : "neutral"
                                                        }
                                                    >
                                                        {item.isActive
                                                            ? t("active")
                                                            : t("inactive")}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-text-muted">
                                                    {formatDate(
                                                        item.createdAt,
                                                        locale,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            aria-label={t(
                                                                "editUser",
                                                            )}
                                                            title={t("editUser")}
                                                            onClick={() => {
                                                                setEditingUser(
                                                                    item,
                                                                );
                                                                setUserOpen(
                                                                    true,
                                                                );
                                                            }}
                                                            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-primary"
                                                        >
                                                            <Pencil
                                                                size={14}
                                                            />
                                                        </button>
                                                        {item.id !== user.id ? (
                                                            <button
                                                                type="button"
                                                                aria-label={t(
                                                                    "deleteUser",
                                                                )}
                                                                title={t(
                                                                    "deleteUser",
                                                                )}
                                                                onClick={() =>
                                                                    setDeletingUser(
                                                                        item,
                                                                    )
                                                                }
                                                                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                                                            >
                                                                <Trash2
                                                                    size={14}
                                                                />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                                <p className="text-xs text-text-muted">
                                    {tCommon("pageOf", {
                                        page:
                                            usersData?.pagination.page ?? 1,
                                        pages:
                                            usersData?.pagination.pages ?? 1,
                                    })}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        aria-label={tCommon("previous")}
                                        disabled={
                                            (usersData?.pagination.page ??
                                                1) <= 1
                                        }
                                        onClick={() =>
                                            setPage((value) =>
                                                Math.max(1, value - 1),
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
                                            (usersData?.pagination.page ??
                                                1) >=
                                            (usersData?.pagination.pages ?? 1)
                                        }
                                        onClick={() =>
                                            setPage((value) =>
                                                Math.min(
                                                    usersData?.pagination
                                                        .pages ?? 1,
                                                    value + 1,
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
                </div>
            ) : null}

            {tab === "departments" ? (
                departmentsLoading ? (
                    <ListSkeleton rows={5} />
                ) : (departments ?? []).length === 0 ? (
                    <EmptyState
                        icon={<Building2 size={22} />}
                        title={t("noDepartmentsTitle")}
                        description={t("noDepartmentsDescription")}
                    />
                ) : (
                    <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
                        <div className="scroll-area grid max-h-[min(65dvh,640px)] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                        {(departments ?? []).map((department) => (
                            <div
                                key={department.id}
                                className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm"
                            >
                                <div
                                    className="absolute inset-x-0 top-0 h-1"
                                    style={{
                                        backgroundColor: department.color,
                                    }}
                                />
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-text-primary">
                                            {department.name}
                                        </p>
                                        <p className="truncate text-[11px] text-text-muted">
                                            @{department.slug}
                                        </p>
                                    </div>
                                    {canManageDepartments ? (
                                        <div className="flex shrink-0 gap-0.5">
                                            <button
                                                type="button"
                                                aria-label={t(
                                                    "editDepartment",
                                                )}
                                                title={t("editDepartment")}
                                                onClick={() => {
                                                    setEditingDepartment(
                                                        department,
                                                    );
                                                    setDepartmentOpen(true);
                                                }}
                                                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-primary"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={t(
                                                    "deleteDepartment",
                                                )}
                                                title={t(
                                                    "deleteDepartment",
                                                )}
                                                onClick={() =>
                                                    setDeletingDepartment(
                                                        department,
                                                    )
                                                }
                                                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>

                                <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-text-secondary">
                                    {department.description ??
                                        t("noDepartmentDescription")}
                                </p>

                                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                                    <div className="flex gap-3 text-[11px] text-text-muted">
                                        <span>
                                            {t("peopleCount", {
                                                count: department.counts.users,
                                            })}
                                        </span>
                                        <span>
                                            {t("projectsCount", {
                                                count:
                                                    department.counts.projects,
                                            })}
                                        </span>
                                        <span>
                                            {t("tasksCount", {
                                                count: department.counts.tasks,
                                            })}
                                        </span>
                                    </div>
                                    <span
                                        className="size-2.5 rounded-full"
                                        style={{
                                            backgroundColor: department.color,
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                )
            ) : null}

            <MemberFormDialog
                open={memberOpen}
                onClose={() => setMemberOpen(false)}
            />

            <UserFormDialog
                open={userOpen}
                onClose={() => {
                    setUserOpen(false);
                    setEditingUser(null);
                }}
                user={editingUser}
            />

            <DepartmentFormDialog
                open={departmentOpen}
                onClose={() => {
                    setDepartmentOpen(false);
                    setEditingDepartment(null);
                }}
                department={editingDepartment}
            />

            <ConfirmDialog
                open={Boolean(removingMember)}
                onClose={() => setRemovingMember(null)}
                title={t("removeMemberTitle")}
                description={t("removeMemberDescription", {
                    name: removingMember?.name ?? "",
                })}
                confirmLabel={t("removeMember")}
                cancelLabel={tCommon("cancel")}
                loading={removeState.isLoading}
                onConfirm={() => void confirmRemoveMember()}
            />

            <ConfirmDialog
                open={Boolean(deletingUser)}
                onClose={() => setDeletingUser(null)}
                title={t("deleteUserTitle")}
                description={t("deleteUserDescription", {
                    name: deletingUser?.name ?? "",
                })}
                confirmLabel={tCommon("delete")}
                cancelLabel={tCommon("cancel")}
                loading={deleteUserState.isLoading}
                onConfirm={() => void confirmDeleteUser()}
            />

            <ConfirmDialog
                open={Boolean(deletingDepartment)}
                onClose={() => setDeletingDepartment(null)}
                title={t("deleteDepartmentTitle")}
                description={t("deleteDepartmentDescription", {
                    name: deletingDepartment?.name ?? "",
                })}
                confirmLabel={tCommon("delete")}
                cancelLabel={tCommon("cancel")}
                loading={deleteDepartmentState.isLoading}
                onConfirm={() => void confirmDeleteDepartment()}
            />
        </div>
    );
}
