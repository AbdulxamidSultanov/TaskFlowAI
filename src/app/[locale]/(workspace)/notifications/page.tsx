"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    Bell,
    BellRing,
    CheckCheck,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Sparkles,
    SquareCheck,
    Trash2,
    Users,
} from "lucide-react";
import {useState} from "react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {PageHeader} from "@/components/ui/layout";
import {EmptyState, ListSkeleton} from "@/components/ui/states";
import {Tabs} from "@/components/ui/tabs";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {useRouter} from "@/i18n/navigation";
import {
    useDeleteNotificationMutation,
    useGetNotificationsQuery,
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
} from "@/lib/redux/api";
import type {Notification} from "@/lib/redux/types";
import type {NotificationType} from "@/lib/domain";
import {cn, formatDateTime, formatRelative} from "@/lib/utils";

const typeIcon: Record<NotificationType, React.ReactNode> = {
    task_assigned: <SquareCheck size={16} />,
    task_due: <CircleAlert size={16} />,
    mention: <Users size={16} />,
    ai: <Sparkles size={16} />,
    system: <Bell size={16} />,
};

export default function NotificationsPage() {
    const t = useTranslations("notificationsPage");
    const tCommon = useTranslations("common");
    const tType = useTranslations("notificationType");
    const locale = useLocale();
    const router = useRouter();
    const toast = useToast();
    const {workspace} = useWorkspace();
    const [tab, setTab] = useState<"all" | "unread">("all");
    const [page, setPage] = useState(1);

    const {data, isLoading} = useGetNotificationsQuery({
        unread: tab === "unread" ? true : undefined,
        page,
        pageSize: 20,
    });
    const [markRead] = useMarkNotificationReadMutation();
    const [markAll, markAllState] = useMarkAllNotificationsReadMutation();
    const [remove] = useDeleteNotificationMutation();

    const open = (notification: Notification) => {
        if (!notification.readAt) void markRead({id: notification.id});
        if (notification.entityType === "task" && notification.entityId) {
            router.push(
                `/tasks?task=${encodeURIComponent(notification.entityId)}`,
            );
        }
    };

    const removeItem = async (id: string) => {
        try {
            await remove({id}).unwrap();
            toast.success(t("deleted"));
        } catch {
            toast.error(t("deleteError"));
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description", {
                    count: data?.unread ?? 0,
                    workspace: workspace.name,
                })}
                actions={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => void markAll()}
                            loading={markAllState.isLoading}
                            disabled={(data?.unread ?? 0) === 0}
                        >
                            <CheckCheck size={15} />
                            {tCommon("markAllRead")}
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs
                    value={tab}
                    onChange={(value) => {
                        setTab(value);
                        setPage(1);
                    }}
                    items={[
                        {
                            value: "all",
                            label: t("tabAll"),
                            count: data?.pagination.total ?? 0,
                        },
                        {
                            value: "unread",
                            label: t("tabUnread"),
                            count: data?.unread ?? 0,
                        },
                    ]}
                />
                <span className="text-xs text-text-muted">
                    {t("lastSync", {
                        time: formatRelative(new Date(), locale),
                    })}
                </span>
            </div>

            {isLoading ? (
                <div className="rounded-2xl border border-border bg-surface p-4">
                    <ListSkeleton rows={6} />
                </div>
            ) : (data?.items ?? []).length === 0 ? (
                <EmptyState
                    icon={
                        tab === "unread" ? (
                            <CheckCheck size={22} />
                        ) : (
                            <BellRing size={22} />
                        )
                    }
                    title={t("emptyTitle")}
                    description={
                        tab === "unread"
                            ? t("emptyUnreadDescription")
                            : t("emptyDescription")
                    }
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                    <div className="scroll-area max-h-[min(65dvh,640px)] divide-y divide-border overflow-y-auto">
                        {(data?.items ?? []).map((notification) => (
                            <div
                                key={notification.id}
                                className={cn(
                                    "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/60",
                                    !notification.readAt &&
                                        "bg-primary/[0.03]",
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => open(notification)}
                                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                >
                                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text-secondary">
                                        {typeIcon[notification.type]}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-semibold text-text-primary">
                                                {notification.title}
                                            </span>
                                            <Badge tone="neutral">
                                                {tType(notification.type)}
                                            </Badge>
                                        </span>
                                        {notification.body ? (
                                            <span className="mt-0.5 block text-xs leading-5 text-text-secondary">
                                                {notification.body}
                                            </span>
                                        ) : null}
                                        <span className="mt-1 block text-[10px] text-text-muted">
                                            {formatDateTime(
                                                notification.createdAt,
                                                locale,
                                            )}
                                        </span>
                                    </span>
                                </button>

                                {!notification.readAt ? (
                                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                                ) : null}

                                <div className="flex shrink-0 items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                    {!notification.readAt ? (
                                        <button
                                            type="button"
                                            aria-label={t("markRead")}
                                            title={t("markRead")}
                                            onClick={() =>
                                                void markRead({
                                                    id: notification.id,
                                                })
                                            }
                                            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-primary"
                                        >
                                            <CheckCheck size={14} />
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        aria-label={tCommon("delete")}
                                        title={tCommon("delete")}
                                        onClick={() =>
                                            void removeItem(notification.id)
                                        }
                                        className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                        <p className="text-xs text-text-muted">
                            {tCommon("pageOf", {
                                page: data?.pagination.page ?? 1,
                                pages: data?.pagination.pages ?? 1,
                            })}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label={tCommon("previous")}
                                disabled={(data?.pagination.page ?? 1) <= 1}
                                onClick={() => setPage((value) => value - 1)}
                            >
                                <ChevronLeft size={15} />
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label={tCommon("next")}
                                disabled={
                                    (data?.pagination.page ?? 1) >=
                                    (data?.pagination.pages ?? 1)
                                }
                                onClick={() => setPage((value) => value + 1)}
                            >
                                <ChevronRight size={15} />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
