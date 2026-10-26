"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    ArrowUp,
    BrainCircuit,
    Clock,
    MessageSquarePlus,
    Sparkles,
    Wand2,
} from "lucide-react";
import {useEffect, useMemo, useRef, useState} from "react";

import {Avatar} from "@/components/ui/avatar";
import {Badge, priorityTone, statusTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Select, Textarea} from "@/components/ui/input";
import {Card, CardHeader, PageHeader} from "@/components/ui/layout";
import {EmptyState, PageLoader} from "@/components/ui/states";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {
    useCreateAiConversationMutation,
    useCreateAiPlanMutation,
    useGetAiConversationsQuery,
    useGetAiMessagesQuery,
    useGetAiPlansQuery,
    useSendAiMessageMutation,
} from "@/lib/redux/api";
import type {AiConversation} from "@/lib/redux/types";
import {
    cn,
    formatDate,
    formatRelative,
    formatTime,
    getApiErrorMessage,
} from "@/lib/utils";

const suggestions = [
    "reprioritizeBlockers",
    "optimizeFocusBlocks",
    "auditDependencies",
    "synthesizeWorkday",
] as const;

export default function AiAssistantPage() {
    const t = useTranslations("aiAssistant");
    const tCommon = useTranslations("common");
    const tPriority = useTranslations("priority");
    const tStatus = useTranslations("status");
    const locale = useLocale();
    const toast = useToast();
    const {workspace, user, canEdit} = useWorkspace();

    const reasonLabels: Record<string, string> = {
        "high priority": t("reasonHighPriority"),
        overdue: t("reasonOverdue"),
        "due soon": t("reasonDueSoon"),
        "needs unblocking": t("reasonNeedsUnblocking"),
        "next best fit": t("reasonNextBestFit"),
    };
    const translateReason = (reason: string) =>
        reason
            .split(", ")
            .map((item) => reasonLabels[item] ?? item)
            .join(", ");

    const {data: conversations, isLoading: conversationsLoading} =
        useGetAiConversationsQuery({workspaceId: workspace.id});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [minutes, setMinutes] = useState("480");

    const {data: messages, isLoading: messagesLoading} = useGetAiMessagesQuery(
        {conversationId: selectedId ?? ""},
        {skip: !selectedId},
    );
    const {data: plans} = useGetAiPlansQuery({workspaceId: workspace.id});

    const [createConversation, createState] = useCreateAiConversationMutation();
    const [sendMessage, sendState] = useSendAiMessageMutation();
    const [createPlan, planState] = useCreateAiPlanMutation();

    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedId && conversations && conversations.length > 0) {
            setSelectedId(conversations[0].id);
        }
    }, [conversations, selectedId]);

    const visibleMessages = useMemo(
        () => (messages ?? []).filter((message) => message.role !== "system"),
        [messages],
    );

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth", block: "end"});
    }, [visibleMessages.length, selectedId, sendState.isLoading]);

    const selectedConversation = conversations?.find(
        (item) => item.id === selectedId,
    );

    const plan = plans?.[0];

    const planStats = useMemo(() => {
        if (!plan) return null;
        const focusMinutes = Math.round(
            plan.items.reduce(
                (sum, item) =>
                    sum +
                    Math.max(
                        0,
                        (new Date(item.endAt).getTime() -
                            new Date(item.startAt).getTime()) /
                            60_000,
                    ),
                0,
            ),
        );
        const sorted = [...plan.items].sort(
            (a, b) =>
                new Date(a.startAt).getTime() -
                new Date(b.startAt).getTime(),
        );
        let collisions = 0;
        for (let index = 1; index < sorted.length; index += 1) {
            if (
                new Date(sorted[index].startAt).getTime() <
                new Date(sorted[index - 1].endAt).getTime()
            ) {
                collisions += 1;
            }
        }
        return {
            focusMinutes,
            bufferMinutes: Math.max(0, plan.availableMinutes - focusMinutes),
            collisions,
        };
    }, [plan]);

    const startConversation = async (
        title?: string,
    ): Promise<AiConversation | null> => {
        try {
            const conversation = await createConversation({
                workspaceId: workspace.id,
                title: title ?? t("newConversationTitle"),
            }).unwrap();
            setSelectedId(conversation.id);
            return conversation;
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("conversationError")));
            return null;
        }
    };

    const send = async (text: string) => {
        const content = text.trim();
        if (!content || sendState.isLoading) return;

        let conversationId = selectedId;
        if (!conversationId) {
            const conversation = await startConversation(
                content.slice(0, 80),
            );
            conversationId = conversation?.id ?? null;
        }
        if (!conversationId) return;

        setInput("");
        try {
            await sendMessage({
                conversationId,
                data: {content},
            }).unwrap();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("messageError")));
        }
    };

    const generatePlan = async () => {
        try {
            await createPlan({
                workspaceId: workspace.id,
                availableMinutes: Number(minutes),
            }).unwrap();
            toast.success(t("planCreated"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("planError")));
        }
    };

    const suggestionText = (key: (typeof suggestions)[number]) => {
        if (key === "auditDependencies") {
            return t(key, {sprint: "Sprint 24"});
        }
        if (key === "synthesizeWorkday") {
            return t(key, {hours: 8});
        }
        return t(key);
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description")}
                actions={
                    <Badge tone="accent" className="h-8 px-3">
                        <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                        {t("plannerStatus", {
                            version: "1.0",
                            status: tCommon("active"),
                        })}
                    </Badge>
                }
            />

            <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
                <Card className="flex max-h-[70dvh] flex-col p-3 xl:max-h-[calc(100dvh-13rem)]">
                    <div className="mb-2 flex items-center justify-between px-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                            {t("conversations")}
                        </p>
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t("newChat")}
                            disabled={createState.isLoading || !canEdit}
                            onClick={() => void startConversation()}
                        >
                            <MessageSquarePlus size={16} />
                        </Button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                        {conversationsLoading ? (
                            <div className="space-y-1.5">
                                <div className="h-10 animate-pulse rounded-lg bg-surface-hover" />
                                <div className="h-10 animate-pulse rounded-lg bg-surface-hover" />
                            </div>
                        ) : (conversations ?? []).length === 0 ? (
                            <p className="px-2 py-6 text-center text-xs text-text-muted">
                                {t("noConversations")}
                            </p>
                        ) : (
                            (conversations ?? []).map((conversation) => (
                                <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() => setSelectedId(conversation.id)}
                                    className={cn(
                                        "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                                        conversation.id === selectedId
                                            ? "bg-primary/10 text-primary"
                                            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                                    )}
                                >
                                    <span className="block truncate text-xs font-medium">
                                        {conversation.title}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] text-text-muted">
                                        {formatRelative(
                                            conversation.updatedAt,
                                            locale,
                                        )}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </Card>

                <div className="flex min-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm xl:max-h-[calc(100dvh-13rem)]">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary">
                                {selectedConversation?.title ??
                                    t("newConversationTitle")}
                            </p>
                            <p className="text-[10px] text-text-muted">
                                {t("model", {
                                    model:
                                        selectedConversation?.model ??
                                        "taskflow-rules-v1",
                                })}
                            </p>
                        </div>
                        <Badge tone="accent">{t("syncedAgenda")}</Badge>
                    </div>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        {!selectedId ? (
                            <div className="flex h-full flex-col items-center justify-center text-center">
                                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                                    <BrainCircuit size={22} />
                                </span>
                                <h2 className="text-base font-semibold text-text-primary">
                                    {t("welcomeTitle")}
                                </h2>
                                <p className="mt-1 max-w-sm text-sm text-text-secondary">
                                    {t("welcomeDescription")}
                                </p>
                            </div>
                        ) : messagesLoading ? (
                            <PageLoader label={tCommon("loading")} />
                        ) : visibleMessages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-center">
                                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                                    <Sparkles size={22} />
                                </span>
                                <h2 className="text-base font-semibold text-text-primary">
                                    {t("welcomeTitle")}
                                </h2>
                                <p className="mt-1 max-w-sm text-sm text-text-secondary">
                                    {t("welcomeDescription")}
                                </p>
                            </div>
                        ) : (
                            visibleMessages.map((message) => {
                                const isUser = message.role === "user";
                                return (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "flex gap-2.5",
                                            isUser && "flex-row-reverse",
                                        )}
                                    >
                                        {isUser ? (
                                            <Avatar
                                                name={user.name}
                                                src={user.avatarUrl}
                                                size="sm"
                                            />
                                        ) : (
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white">
                                                <Sparkles size={14} />
                                            </span>
                                        )}
                                        <div
                                            className={cn(
                                                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                                                isUser
                                                    ? "rounded-tr-sm bg-primary text-white"
                                                    : "rounded-tl-sm bg-surface-elevated text-text-primary",
                                            )}
                                        >
                                            <p className="whitespace-pre-wrap">
                                                {message.content}
                                            </p>
                                            <p
                                                className={cn(
                                                    "mt-1 text-[9px]",
                                                    isUser
                                                        ? "text-white/60"
                                                        : "text-text-muted",
                                                )}
                                            >
                                                {formatRelative(
                                                    message.createdAt,
                                                    locale,
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {sendState.isLoading ? (
                            <div className="flex gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white">
                                    <Sparkles size={14} />
                                </span>
                                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-surface-elevated px-3.5 py-3">
                                    {[0, 1, 2].map((index) => (
                                        <span
                                            key={index}
                                            className="size-1.5 animate-bounce rounded-full bg-accent"
                                            style={{
                                                animationDelay: `${index * 120}ms`,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <div ref={bottomRef} />
                    </div>

                    <div className="border-t border-border p-3">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {suggestions.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    disabled={!canEdit || sendState.isLoading}
                                    onClick={() => void send(suggestionText(key))}
                                    className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                                >
                                    {suggestionText(key)}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-end gap-2">
                            <Textarea
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                placeholder={t("promptPlaceholder")}
                                rows={1}
                                className="min-h-10 flex-1 py-2.5"
                                disabled={!canEdit}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        !event.shiftKey
                                    ) {
                                        event.preventDefault();
                                        void send(input);
                                    }
                                }}
                            />
                            <Button
                                size="icon"
                                aria-label={t("send")}
                                disabled={
                                    !input.trim() ||
                                    sendState.isLoading ||
                                    !canEdit
                                }
                                onClick={() => void send(input)}
                            >
                                <ArrowUp size={17} />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <Card>
                        <CardHeader
                            title={t("recommendedPlanTitle")}
                            description={
                                plan
                                    ? t("planSummary", {
                                          count: plan.items.length,
                                      })
                                    : t("planEmpty")
                            }
                            action={
                                <Wand2 size={16} className="text-accent" />
                            }
                        />

                        <div className="mb-3 flex items-center gap-2">
                            <Select
                                value={minutes}
                                onChange={(event) =>
                                    setMinutes(event.target.value)
                                }
                                aria-label={t("availableMinutes")}
                                className="h-9 flex-1 text-xs"
                            >
                                <option value="180">
                                    {t("minutesOption", {count: 180})}
                                </option>
                                <option value="240">
                                    {t("minutesOption", {count: 240})}
                                </option>
                                <option value="480">
                                    {t("minutesOption", {count: 480})}
                                </option>
                                <option value="720">
                                    {t("minutesOption", {count: 720})}
                                </option>
                            </Select>
                            <Button
                                size="sm"
                                onClick={() => void generatePlan()}
                                loading={planState.isLoading}
                                disabled={!canEdit}
                            >
                                {tCommon("generatePlan")}
                            </Button>
                        </div>

                        {plan ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-[10px] text-text-muted">
                                    <span>
                                        {formatDate(plan.date, locale)}
                                    </span>
                                    <span>
                                        {t("availableMinutesShort", {
                                            count: plan.availableMinutes,
                                        })}
                                    </span>
                                </div>
                                <div className="space-y-1.5">
                                    {plan.items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="rounded-xl border border-border bg-surface-elevated/40 p-2.5"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium tabular-nums text-accent">
                                                    <Clock size={10} />
                                                    {formatTime(
                                                        item.startAt,
                                                        locale,
                                                    )}{" "}
                                                    –{" "}
                                                    {formatTime(
                                                        item.endAt,
                                                        locale,
                                                    )}
                                                </span>
                                                {item.task ? (
                                                    <Badge
                                                        tone={
                                                            priorityTone[
                                                                item.task
                                                                    .priority
                                                            ]
                                                        }
                                                        className="text-[9px]"
                                                    >
                                                        {tPriority(
                                                            item.task.priority,
                                                        )}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <p className="mt-1 line-clamp-2 text-xs font-semibold text-text-primary">
                                                {item.task?.title ??
                                                    t("focusBlock")}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                {item.project ? (
                                                    <span className="text-[10px] text-text-muted">
                                                        {item.project.name}
                                                    </span>
                                                ) : null}
                                                {item.task ? (
                                                    <Badge
                                                        tone={
                                                            statusTone[
                                                                item.task
                                                                    .status
                                                            ]
                                                        }
                                                        className="text-[9px]"
                                                    >
                                                        {tStatus(
                                                            item.task.status,
                                                        )}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            {item.reason ? (
                                                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-text-muted">
                                                    {translateReason(
                                                        item.reason,
                                                    )}
                                                </p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>

                                {plan.rationale ? (
                                    <div className="rounded-xl bg-accent/5 p-2.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                                            {t("strategicRationale")}
                                        </p>
                                        <p className="mt-1 text-[11px] leading-5 text-text-secondary">
                                            {t("planRationaleNote")}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Wand2 size={18} />}
                                title={t("noPlanTitle")}
                                description={t("noPlanDescription")}
                                className="border-0 bg-transparent px-2 py-6"
                            />
                        )}
                    </Card>

                    <Card>
                        <CardHeader
                            title={t("executionProfile")}
                            description={t("maxThroughput")}
                        />
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-text-secondary">
                                    {t("focusTime")}
                                </span>
                                <span className="font-medium text-text-primary">
                                    {planStats
                                        ? t("durationHours", {
                                              hours: Math.floor(
                                                  planStats.focusMinutes / 60,
                                              ),
                                              minutes:
                                                  planStats.focusMinutes % 60,
                                          })
                                        : "—"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-text-secondary">
                                    {t("bufferTime")}
                                </span>
                                <span className="font-medium text-text-primary">
                                    {planStats
                                        ? t("durationHours", {
                                              hours: Math.floor(
                                                  planStats.bufferMinutes / 60,
                                              ),
                                              minutes:
                                                  planStats.bufferMinutes % 60,
                                          })
                                        : "—"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-text-secondary">
                                    {t("collisions")}
                                </span>
                                <span className="font-medium text-success">
                                    {planStats?.collisions ?? 0}
                                </span>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
