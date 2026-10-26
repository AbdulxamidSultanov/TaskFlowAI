"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    Bell,
    Check,
    CheckCheck,
    ChevronDown,
    Languages,
    LogOut,
    Menu,
    Monitor,
    Moon,
    Palette,
    Plus,
    Search,
    Settings,
    Sun,
    UserRound,
    X,
} from "lucide-react";
import {useSearchParams} from "next/navigation";
import {useEffect, useRef, useState, useTransition} from "react";

import {TaskFormDialog} from "@/components/tasks/task-form-dialog";
import {useTheme} from "@/components/theme-provider";
import {Avatar} from "@/components/ui/avatar";
import {Button} from "@/components/ui/button";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link, usePathname, useRouter} from "@/i18n/navigation";
import {languageNames, routing} from "@/i18n/routing";
import {
    useGetNotificationsQuery,
    useLogoutMutation,
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
} from "@/lib/redux/api";
import {cn, formatRelative, getApiErrorMessage} from "@/lib/utils";

export function AppHeader({onMenuClick}: {onMenuClick: () => void}) {
    const t = useTranslations("common");
    const locale = useLocale();
    const router = useRouter();
    const toast = useToast();
    const {user} = useWorkspace();

    const {theme, setTheme} = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isLocalePending, startLocaleTransition] = useTransition();

    const changeLocale = (nextLocale: (typeof routing.locales)[number]) => {
        const query = searchParams.toString();
        const href = query ? `${pathname}?${query}` : pathname;
        setProfileOpen(false);
        startLocaleTransition(() => {
            router.replace(href, {locale: nextLocale});
        });
    };

    const themeOptions = [
        {value: "light", icon: Sun, label: t("light")},
        {value: "dark", icon: Moon, label: t("dark")},
        {value: "system", icon: Monitor, label: t("system")},
    ] as const;

    const [search, setSearch] = useState("");
    const [mobileSearch, setMobileSearch] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);

    const notificationsRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    const {data: notifications} = useGetNotificationsQuery({pageSize: 6});
    const [markRead] = useMarkNotificationReadMutation();
    const [markAll, markAllState] = useMarkAllNotificationsReadMutation();
    const [logout, logoutState] = useLogoutMutation();

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                notificationsRef.current &&
                !notificationsRef.current.contains(target)
            ) {
                setNotificationsOpen(false);
            }
            if (
                profileRef.current &&
                !profileRef.current.contains(target)
            ) {
                setProfileOpen(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const submitSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const value = search.trim();
        if (!value) return;
        setMobileSearch(false);
        router.push(`/tasks?search=${encodeURIComponent(value)}`);
    };

    const handleLogout = async () => {
        try {
            await logout().unwrap();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("errorGeneric")));
        } finally {
            setProfileOpen(false);
            router.replace("/login");
            router.refresh();
        }
    };

    const openNotification = async (
        id: string,
        readAt: string | null,
        entityType: string | null,
        entityId: string | null,
    ) => {
        if (!readAt) {
            void markRead({id});
        }
        setNotificationsOpen(false);
        if (entityType === "task" && entityId) {
            router.push(`/tasks?task=${encodeURIComponent(entityId)}`);
        }
    };

    const unread = notifications?.unread ?? 0;

    return (
        <>
            <header className="sticky top-0 z-30 border-b border-border bg-sidebar/95 backdrop-blur">
                <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-8">
                    <button
                        type="button"
                        onClick={onMenuClick}
                        aria-label={t("openMenu")}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary md:hidden"
                    >
                        <Menu size={20} />
                    </button>

                    <form
                        onSubmit={submitSearch}
                        className="hidden w-full max-w-md min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 md:flex"
                        role="search"
                    >
                        <Search
                            size={17}
                            className="shrink-0 text-text-secondary"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            aria-label={t("globalSearchPlaceholder")}
                            placeholder={t("globalSearchPlaceholder")}
                            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                        />
                        <kbd className="hidden shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] text-text-muted lg:block">
                            Ctrl K
                        </kbd>
                    </form>

                    <button
                        type="button"
                        aria-label={t("search")}
                        onClick={() => setMobileSearch((value) => !value)}
                        className="flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover md:hidden"
                    >
                        {mobileSearch ? <X size={19} /> : <Search size={19} />}
                    </button>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
                        <Link
                            href="/ai-assistant"
                            className="hidden h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:flex"
                        >
                            <span className="text-sm">✦</span>
                            <span>{t("askAI")}</span>
                        </Link>

                        <div ref={notificationsRef} className="relative">
                            <button
                                type="button"
                                aria-label={t("notifications")}
                                aria-expanded={notificationsOpen}
                                onClick={() =>
                                    setNotificationsOpen((value) => !value)
                                }
                                className="relative flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                            >
                                <Bell size={19} strokeWidth={1.75} />
                                {unread > 0 ? (
                                    <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold leading-4 text-white">
                                        {unread > 9 ? "9+" : unread}
                                    </span>
                                ) : null}
                            </button>

                            {notificationsOpen ? (
                                <div className="absolute right-0 top-full z-40 mt-2 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
                                    <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                                        <div>
                                            <p className="text-sm font-semibold text-text-primary">
                                                {t("notifications")}
                                            </p>
                                            <p className="text-[11px] text-text-muted">
                                                {t("unreadCount", {count: unread})}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={
                                                unread === 0 ||
                                                markAllState.isLoading
                                            }
                                            onClick={() => void markAll()}
                                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/5 disabled:opacity-40"
                                        >
                                            <CheckCheck size={13} />
                                            {t("markAllRead")}
                                        </button>
                                    </div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {(notifications?.items ?? []).length ===
                                        0 ? (
                                            <p className="px-3 py-8 text-center text-sm text-text-muted">
                                                {t("noNotifications")}
                                            </p>
                                        ) : (
                                            (notifications?.items ?? []).map(
                                                (item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() =>
                                                            void openNotification(
                                                                item.id,
                                                                item.readAt,
                                                                item.entityType,
                                                                item.entityId,
                                                            )
                                                        }
                                                        className={cn(
                                                            "flex w-full gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover",
                                                            !item.readAt &&
                                                                "bg-primary/[0.03]",
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                "mt-1.5 size-1.5 shrink-0 rounded-full",
                                                                item.readAt
                                                                    ? "bg-transparent"
                                                                    : "bg-primary",
                                                            )}
                                                        />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-xs font-semibold text-text-primary">
                                                                {item.title}
                                                            </span>
                                                            {item.body ? (
                                                                <span className="mt-0.5 line-clamp-2 block text-[11px] text-text-secondary">
                                                                    {item.body}
                                                                </span>
                                                            ) : null}
                                                            <span className="mt-1 block text-[10px] text-text-muted">
                                                                {formatRelative(
                                                                    item.createdAt,
                                                                    locale,
                                                                )}
                                                            </span>
                                                        </span>
                                                    </button>
                                                ),
                                            )
                                        )}
                                    </div>
                                    <Link
                                        href="/notifications"
                                        onClick={() =>
                                            setNotificationsOpen(false)
                                        }
                                        className="block border-t border-border py-2 text-center text-xs font-medium text-primary hover:bg-surface-hover"
                                    >
                                        {t("viewAll")}
                                    </Link>
                                </div>
                            ) : null}
                        </div>

                        <Button
                            size="md"
                            className="h-9 px-2.5 sm:px-3"
                            onClick={() => setTaskOpen(true)}
                        >
                            <Plus size={17} />
                            <span className="hidden sm:inline">
                                {t("newTask")}
                            </span>
                        </Button>

                        <div ref={profileRef} className="relative">
                            <button
                                type="button"
                                aria-label={t("profile")}
                                aria-expanded={profileOpen}
                                onClick={() =>
                                    setProfileOpen((value) => !value)
                                }
                                className="flex items-center gap-1 rounded-full"
                            >
                                <Avatar
                                    name={user.name}
                                    src={user.avatarUrl}
                                    size="sm"
                                />
                                <ChevronDown
                                    size={14}
                                    className="hidden text-text-muted sm:block"
                                />
                            </button>

                            {profileOpen ? (
                                <div className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
                                    <div className="flex items-center gap-3 border-b border-border p-3">
                                        <Avatar
                                            name={user.name}
                                            src={user.avatarUrl}
                                            size="md"
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-text-primary">
                                                {user.name}
                                            </p>
                                            <p className="truncate text-[11px] text-text-muted">
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-1">
                                        <Link
                                            href="/settings?tab=profile"
                                            onClick={() =>
                                                setProfileOpen(false)
                                            }
                                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                                        >
                                            <UserRound size={15} />
                                            {t("profile")}
                                        </Link>
                                        <Link
                                            href="/settings?tab=preferences"
                                            onClick={() =>
                                                setProfileOpen(false)
                                            }
                                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                                        >
                                            <Settings size={15} />
                                            {t("settings")}
                                        </Link>
                                    </div>

                                    <div className="border-t border-border px-3 py-2.5">
                                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                                            <Palette size={11} />
                                            {t("theme")}
                                        </p>
                                        <div className="grid grid-cols-3 gap-1">
                                            {themeOptions.map((item) => {
                                                const Icon = item.icon;
                                                const active =
                                                    mounted &&
                                                    theme === item.value;
                                                return (
                                                    <button
                                                        key={item.value}
                                                        type="button"
                                                        aria-pressed={active}
                                                        onClick={() =>
                                                            setTheme(item.value)
                                                        }
                                                        className={cn(
                                                            "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] font-medium transition-colors",
                                                            active
                                                                ? "border-primary bg-primary/5 text-primary"
                                                                : "border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                                                        )}
                                                    >
                                                        <Icon size={14} />
                                                        {item.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="border-t border-border px-3 py-2.5">
                                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                                            <Languages size={11} />
                                            {t("language")}
                                        </p>
                                        <div className="space-y-0.5">
                                            {routing.locales.map((item) => {
                                                const active = locale === item;
                                                return (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        disabled={
                                                            isLocalePending ||
                                                            active
                                                        }
                                                        onClick={() =>
                                                            changeLocale(item)
                                                        }
                                                        className={cn(
                                                            "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors",
                                                            active
                                                                ? "bg-primary/5 font-medium text-primary"
                                                                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                                                        )}
                                                    >
                                                        <span>
                                                            {languageNames[item]}
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="text-[10px] uppercase text-text-muted">
                                                                {item}
                                                            </span>
                                                            {active ? (
                                                                <Check size={14} />
                                                            ) : (
                                                                <span className="size-3.5" />
                                                            )}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="border-t border-border p-1">
                                        <button
                                            type="button"
                                            disabled={logoutState.isLoading}
                                            onClick={() => void handleLogout()}
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-error hover:bg-error/5"
                                        >
                                            <LogOut size={15} />
                                            {t("logout")}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                {mobileSearch ? (
                    <form
                        onSubmit={submitSearch}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 md:hidden"
                    >
                        <Search size={16} className="text-text-muted" />
                        <input
                            autoFocus
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t("globalSearchPlaceholder")}
                            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                        />
                    </form>
                ) : null}
            </header>

            <TaskFormDialog
                open={taskOpen}
                onClose={() => setTaskOpen(false)}
            />
        </>
    );
}

export default AppHeader;
