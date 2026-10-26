"use client";

import {useTranslations} from "next-intl";
import {
    CalendarDays,
    ChartNoAxesColumn,
    ChevronsUpDown,
    FolderKanban,
    House,
    LayoutGrid,
    LifeBuoy,
    LogOut,
    Plus,
    Settings,
    Sparkles,
    SquareCheck,
    Users,
    X,
} from "lucide-react";
import {useEffect, useRef, useState} from "react";

import {Avatar} from "@/components/ui/avatar";
import {Badge, roleTone} from "@/components/ui/badge";
import {ProgressBar} from "@/components/ui/layout";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link, useRouter} from "@/i18n/navigation";
import {useGetProjectsQuery, useLogoutMutation} from "@/lib/redux/api";
import {useAppDispatch} from "@/lib/redux/hooks";
import {setActiveWorkspace} from "@/lib/redux/workspace-slice";
import {cn, fileSize, getApiErrorMessage} from "@/lib/utils";

const navItems = [
    {href: "/dashboard", key: "dashboard", icon: House},
    {href: "/tasks", key: "tasks", icon: SquareCheck},
    {href: "/projects", key: "projects", icon: FolderKanban},
    {href: "/calendar", key: "calendar", icon: CalendarDays},
    {href: "/analytics", key: "analytics", icon: ChartNoAxesColumn},
    {href: "/ai-assistant", key: "aiAssistant", icon: Sparkles},
    {href: "/team", key: "team", icon: Users},
] as const;

export function AppSidebar({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const t = useTranslations("navigation");
    const tCommon = useTranslations("common");
    const tWs = useTranslations("workspace");
    const tRole = useTranslations("workspaceRole");
    const router = useRouter();
    const toast = useToast();
    const dispatch = useAppDispatch();
    const {
        workspace,
        workspaces,
        user,
        role,
        canManageWorkspace,
    } = useWorkspace();
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const switcherRef = useRef<HTMLDivElement>(null);
    const [logout, logoutState] = useLogoutMutation();

    const {data: projectsData} = useGetProjectsQuery({
        workspaceId: workspace.id,
        pageSize: 6,
    });

    const planLabel = (plan: string) => {
        if (plan === "business") return tWs("planBusiness");
        if (plan === "pro") return tWs("planPro");
        return tWs("planFree");
    };

    useEffect(() => {
        if (!switcherOpen) return;
        const onClick = (event: MouseEvent) => {
            if (
                switcherRef.current &&
                !switcherRef.current.contains(event.target as Node)
            ) {
                setSwitcherOpen(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [switcherOpen]);

    const storagePercent =
        workspace.storageLimitBytes > 0
            ? Math.round(
                  (workspace.storageUsedBytes / workspace.storageLimitBytes) *
                      100,
              )
            : 0;

    const handleLogout = async () => {
        try {
            await logout().unwrap();
        } catch (error) {
            toast.error(getApiErrorMessage(error, tCommon("errorGeneric")));
        } finally {
            onClose();
            router.replace("/login");
            router.refresh();
        }
    };

    return (
        <>
            <div
                aria-hidden
                onClick={onClose}
                className={cn(
                    "fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity md:hidden",
                    open
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0",
                )}
            />

            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r border-border bg-sidebar transition-transform duration-200 md:translate-x-0",
                    open ? "translate-x-0" : "-translate-x-full",
                )}
                aria-label={t("heading")}
            >
                <div className="flex items-center justify-between px-4 pb-2 pt-4">
                    <Link
                        href="/dashboard"
                        onClick={onClose}
                        className="flex items-center gap-2"
                    >
                        <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-sm">
                            <Sparkles size={16} />
                        </span>
                        <span className="text-base font-semibold tracking-tight text-text-primary">
                            TaskFlowAI
                        </span>
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={tCommon("close")}
                        className="flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover md:hidden"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div ref={switcherRef} className="relative px-3 pt-2">
                    <button
                        type="button"
                        onClick={() => setSwitcherOpen((value) => !value)}
                        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
                    >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <LayoutGrid size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-text-primary">
                                {workspace.name}
                            </span>
                            <span className="block truncate text-[11px] text-text-muted">
                                {planLabel(workspace.plan)} ·{" "}
                                {workspace.memberCount} {tWs("members")}
                            </span>
                        </span>
                        <ChevronsUpDown
                            size={14}
                            className="shrink-0 text-text-muted"
                        />
                    </button>

                    {switcherOpen ? (
                        <div className="absolute left-3 right-3 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
                            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                {t("workspaces")}
                            </p>
                            <div className="scroll-area max-h-56 overflow-y-auto overscroll-contain p-1">
                                {workspaces.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => {
                                            dispatch(
                                                setActiveWorkspace(item.id),
                                            );
                                            setSwitcherOpen(false);
                                        }}
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-hover",
                                            item.id === workspace.id &&
                                                "bg-primary/5",
                                        )}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium text-text-primary">
                                                {item.name}
                                            </span>
                                            <span className="block text-[11px] text-text-muted">
                                                {planLabel(item.plan)} ·{" "}
                                                {item.memberCount}{" "}
                                                {tWs("members")}
                                            </span>
                                        </span>
                                        {item.id === workspace.id ? (
                                            <Badge tone="primary">
                                                {tWs("current")}
                                            </Badge>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                            {canManageWorkspace ? (
                                <Link
                                    href="/settings?tab=workspace"
                                    onClick={() => setSwitcherOpen(false)}
                                    className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs font-medium text-primary hover:bg-surface-hover"
                                >
                                    <Plus size={14} />
                                    {tWs("create")}
                                </Link>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <div className="scroll-area mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        {t("heading")}
                    </p>
                    <nav className="flex flex-col gap-0.5">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className={cn(
                                        "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
                                        item.href === "/ai-assistant" &&
                                            "text-accent hover:text-accent",
                                    )}
                                >
                                    <Icon
                                        size={17}
                                        className="shrink-0 text-text-muted transition-colors group-hover:text-current"
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                        {t(item.key)}
                                    </span>
                                    {item.href === "/tasks" ? (
                                        <span className="rounded-full bg-surface-hover px-1.5 text-[10px] tabular-nums text-text-muted">
                                            {workspace.taskCount}
                                        </span>
                                    ) : null}
                                    {item.href === "/ai-assistant" ? (
                                        <span className="rounded-full bg-accent/10 px-1.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                                            {t("newBadge")}
                                        </span>
                                    ) : null}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-5 flex items-center justify-between px-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                            {tWs("projects")}
                        </p>
                        <Link
                            href="/projects"
                            onClick={onClose}
                            className="text-[11px] font-medium text-primary hover:underline"
                        >
                            {tCommon("viewAll")}
                        </Link>
                    </div>
                    <div className="scroll-area mt-1.5 max-h-64 space-y-0.5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1">
                        {(projectsData?.items ?? []).map((project) => (
                            <Link
                                key={project.id}
                                href={`/projects/${project.id}`}
                                onClick={onClose}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                            >
                                <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{backgroundColor: project.color}}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                    {project.name}
                                </span>
                                <span className="text-[10px] tabular-nums text-text-muted">
                                    {project.taskCount}
                                </span>
                            </Link>
                        ))}
                        <Link
                            href="/projects?new=1"
                            onClick={onClose}
                            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-primary"
                        >
                            <Plus size={13} />
                            {t("newProject")}
                        </Link>
                    </div>
                </div>

                <div className="shrink-0 border-t border-border p-3">
                    <div className="rounded-xl bg-surface-elevated p-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-text-primary">
                                {t("freeTierStorage")}
                            </span>
                            <span className="tabular-nums text-text-muted">
                                {storagePercent}%
                            </span>
                        </div>
                        <ProgressBar
                            value={storagePercent}
                            tone={storagePercent > 85 ? "danger" : "primary"}
                            className="mt-2"
                        />
                        <p className="mt-1.5 text-[10px] text-text-muted">
                            {fileSize(workspace.storageUsedBytes)} /{" "}
                            {fileSize(workspace.storageLimitBytes)}
                        </p>
                    </div>

                    <div className="mt-2 space-y-0.5">
                        <Link
                            href="/settings"
                            onClick={onClose}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        >
                            <Settings size={16} />
                            {t("settings")}
                        </Link>
                        <a
                            href="mailto:support@taskflow.ai"
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        >
                            <LifeBuoy size={16} />
                            {t("support")}
                        </a>
                    </div>

                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface p-2">
                        <Link
                            href="/settings?tab=profile"
                            onClick={onClose}
                            title={tCommon("profile")}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg transition-colors hover:bg-surface-hover"
                        >
                            <Avatar
                                name={user.name}
                                src={user.avatarUrl}
                                size="sm"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-text-primary">
                                    {user.name}
                                </p>
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-[10px] text-text-muted">
                                        {user.jobTitle ?? user.email}
                                    </span>
                                    <Badge
                                        tone={roleTone[role]}
                                        className="shrink-0 px-1.5 py-0 text-[9px] leading-4"
                                    >
                                        {tRole(role)}
                                    </Badge>
                                </div>
                            </div>
                        </Link>
                        <button
                            type="button"
                            onClick={() => void handleLogout()}
                            disabled={logoutState.isLoading}
                            aria-label={tCommon("logout")}
                            title={tCommon("logout")}
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-error"
                        >
                            <LogOut size={14} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default AppSidebar;
