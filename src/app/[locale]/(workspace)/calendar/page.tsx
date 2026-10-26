"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    MapPin,
    Plus,
    SquareCheck,
} from "lucide-react";
import {useMemo, useState} from "react";

import {EventFormDialog} from "@/components/calendar/event-form-dialog";
import {TaskDetailDialog} from "@/components/tasks/task-detail-dialog";
import {TaskFormDialog} from "@/components/tasks/task-form-dialog";
import {Badge, statusTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/input";
import {PageHeader} from "@/components/ui/layout";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {
    useGetCalendarEventsQuery,
    useGetProjectsQuery,
    useGetTasksQuery,
} from "@/lib/redux/api";
import type {CalendarEvent, TaskDetail, TaskListItem} from "@/lib/redux/types";
import {
    addMonths,
    cn,
    formatDate,
    formatTime,
    monthMatrix,
    sameDay,
    toDateInputValue,
} from "@/lib/utils";

const weekDayDate = new Date(2024, 0, 1); // Monday

export default function CalendarPage() {
    const t = useTranslations("calendarPage");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("status");
    const locale = useLocale();
    const {workspace, canEdit} = useWorkspace();

    const [current, setCurrent] = useState(() => new Date());
    const [selectedDay, setSelectedDay] = useState(() => new Date());
    const [projectId, setProjectId] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<CalendarEvent | null>(null);
    const [defaultDate, setDefaultDate] = useState<Date | undefined>();

    const [taskFormOpen, setTaskFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
    const [defaultDueDate, setDefaultDueDate] = useState<string | undefined>();
    const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

    const days = useMemo(() => monthMatrix(current), [current]);
    const rangeStart = days[0];
    const rangeEnd = days[days.length - 1];

    const rangeFrom = new Date(
        rangeStart.getFullYear(),
        rangeStart.getMonth(),
        rangeStart.getDate(),
        0,
        0,
        0,
    ).toISOString();
    const rangeTo = new Date(
        rangeEnd.getFullYear(),
        rangeEnd.getMonth(),
        rangeEnd.getDate(),
        23,
        59,
        59,
    ).toISOString();

    const {data: projectsData} = useGetProjectsQuery({
        workspaceId: workspace.id,
        pageSize: 100,
    });
    const {data: tasksData, isLoading: tasksLoading} = useGetTasksQuery({
        workspaceId: workspace.id,
        projectId: projectId || undefined,
        dueFrom: rangeFrom,
        dueTo: rangeTo,
        pageSize: 100,
    });
    const {data: events, isLoading} = useGetCalendarEventsQuery({
        workspaceId: workspace.id,
        projectId: projectId || undefined,
        from: rangeFrom,
        to: rangeTo,
    });

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const event of events ?? []) {
            const date = new Date(event.startAt);
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const list = map.get(key) ?? [];
            list.push(event);
            map.set(key, list);
        }
        for (const list of map.values()) {
            list.sort(
                (a, b) =>
                    new Date(a.startAt).getTime() -
                    new Date(b.startAt).getTime(),
            );
        }
        return map;
    }, [events]);

    const tasksByDay = useMemo(() => {
        const map = new Map<string, TaskListItem[]>();
        for (const task of tasksData?.items ?? []) {
            if (!task.dueDate) continue;
            const date = new Date(task.dueDate);
            const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const list = map.get(key) ?? [];
            list.push(task);
            map.set(key, list);
        }
        return map;
    }, [tasksData]);

    const projectById = useMemo(() => {
        const map = new Map<string, {name: string; color: string}>();
        for (const project of projectsData?.items ?? []) {
            map.set(project.id, {
                name: project.name,
                color: project.color,
            });
        }
        return map;
    }, [projectsData]);

    const dayKey = (date: Date) =>
        `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const selectedEvents = eventsByDay.get(dayKey(selectedDay)) ?? [];
    const selectedTasks = tasksByDay.get(dayKey(selectedDay)) ?? [];

    const openCreate = (date?: Date) => {
        setEditing(null);
        setDefaultDate(date ?? selectedDay);
        setFormOpen(true);
    };

    const openEdit = (event: CalendarEvent) => {
        setEditing(event);
        setFormOpen(true);
    };

    const openTaskCreate = (date?: Date) => {
        setEditingTask(null);
        setDefaultDueDate(toDateInputValue(date ?? selectedDay));
        setTaskFormOpen(true);
    };

    const openTaskEdit = (task: TaskDetail) => {
        setDetailTaskId(null);
        setEditingTask(task);
        setTaskFormOpen(true);
    };

    const weekDays = Array.from({length: 7}, (_, index) => {
        const day = new Date(weekDayDate);
        day.setDate(day.getDate() + index);
        return formatDate(day, locale, {weekday: "short"});
    });

    const monthLabel = formatDate(current, locale, {
        month: "long",
        year: "numeric",
    });

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description")}
                actions={
                    <>
                        <Select
                            value={projectId}
                            onChange={(event) =>
                                setProjectId(event.target.value)
                            }
                            aria-label={tCommon("project")}
                            className="w-auto min-w-[160px]"
                        >
                            <option value="">{t("allProjects")}</option>
                            {(projectsData?.items ?? []).map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                        <Button onClick={() => openCreate()} disabled={!canEdit}>
                            <Plus size={16} />
                            {t("newEvent")}
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label={tCommon("previous")}
                                onClick={() =>
                                    setCurrent((value) => addMonths(value, -1))
                                }
                            >
                                <ChevronLeft size={16} />
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label={tCommon("next")}
                                onClick={() =>
                                    setCurrent((value) => addMonths(value, 1))
                                }
                            >
                                <ChevronRight size={16} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    const today = new Date();
                                    setCurrent(today);
                                    setSelectedDay(today);
                                }}
                            >
                                {tCommon("today")}
                            </Button>
                        </div>
                        <h2 className="text-base font-semibold capitalize text-text-primary">
                            {monthLabel}
                        </h2>
                        <span className="text-xs text-text-muted">
                            {t("eventCount", {count: events?.length ?? 0})}
                        </span>
                    </div>

                    <div className="grid grid-cols-7 border-b border-border bg-surface-elevated/60">
                        {weekDays.map((day) => (
                            <div
                                key={day}
                                className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7">
                        {days.map((day) => {
                            const inMonth =
                                day.getMonth() === current.getMonth();
                            const isToday = sameDay(day, new Date());
                            const isSelected = sameDay(day, selectedDay);
                            const dayEvents =
                                eventsByDay.get(dayKey(day)) ?? [];
                            const dayTasks = tasksByDay.get(dayKey(day)) ?? [];
                            const eventLimit = dayTasks.length > 0 ? 2 : 3;
                            const hiddenItems =
                                dayTasks.length +
                                dayEvents.length -
                                Math.min(dayTasks.length, 2) -
                                Math.min(dayEvents.length, eventLimit);
                            return (
                                <div
                                    key={day.toISOString()}
                                    onClick={() => setSelectedDay(day)}
                                    className={cn(
                                        "group relative min-h-[96px] cursor-pointer border-b border-r border-border/70 p-1.5 transition-colors last:border-r-0",
                                        !inMonth && "bg-surface-elevated/30",
                                        isSelected && "bg-primary/[0.04]",
                                        "hover:bg-surface-hover",
                                    )}
                                >
                                    <div className="mb-1 flex items-center justify-between">
                                        <span
                                            className={cn(
                                                "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                                                !inMonth && "text-text-muted/60",
                                                inMonth && "text-text-primary",
                                                isToday &&
                                                    "bg-primary text-white",
                                            )}
                                        >
                                            {day.getDate()}
                                        </span>
                                        {canEdit ? (
                                            <button
                                                type="button"
                                                aria-label={t("newEvent")}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelectedDay(day);
                                                    openCreate(day);
                                                }}
                                                className="hidden size-5 items-center justify-center rounded text-text-muted hover:bg-primary/10 hover:text-primary group-hover:flex"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        ) : null}
                                    </div>

                                    <div className="space-y-0.5">
                                        {dayTasks.slice(0, 2).map((task) => (
                                            <button
                                                key={task.id}
                                                type="button"
                                                onClick={(clickEvent) => {
                                                    clickEvent.stopPropagation();
                                                    setDetailTaskId(task.id);
                                                }}
                                                className="flex w-full items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] font-medium text-text-secondary hover:bg-surface-hover"
                                                title={`${task.title} · ${projectById.get(task.projectId)?.name ?? ""}`}
                                            >
                                                <span
                                                    className="size-1.5 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            projectById.get(
                                                                task.projectId,
                                                            )?.color ??
                                                            "#4F46E5",
                                                    }}
                                                />
                                                <span
                                                    className={cn(
                                                        "truncate",
                                                        task.status ===
                                                            "completed" &&
                                                            "line-through opacity-60",
                                                    )}
                                                >
                                                    {task.title}
                                                </span>
                                            </button>
                                        ))}
                                        {dayEvents
                                            .slice(0, eventLimit)
                                            .map((event) => (
                                                <button
                                                    key={event.id}
                                                    type="button"
                                                    onClick={(clickEvent) => {
                                                        clickEvent.stopPropagation();
                                                        openEdit(event);
                                                    }}
                                                    className="flex w-full items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] font-medium text-white"
                                                    style={{
                                                        backgroundColor:
                                                            event.project
                                                                ?.color ??
                                                            event.department
                                                                ?.color ??
                                                            "#4F46E5",
                                                    }}
                                                    title={event.title}
                                                >
                                                    {!event.allDay ? (
                                                        <span className="shrink-0 tabular-nums opacity-80">
                                                            {formatTime(
                                                                event.startAt,
                                                                locale,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                    <span className="truncate">
                                                        {event.title}
                                                    </span>
                                                </button>
                                            ))}
                                        {hiddenItems > 0 ? (
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelectedDay(day);
                                                }}
                                                className="px-1 text-[10px] font-medium text-primary hover:underline"
                                            >
                                                +{hiddenItems}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                                    {t("tasks")}
                                </p>
                                <h2 className="mt-1 text-base font-semibold capitalize text-text-primary">
                                    {formatDate(selectedDay, locale, {
                                        weekday: "long",
                                        day: "numeric",
                                        month: "long",
                                    })}
                                </h2>
                            </div>
                            {canEdit ? (
                                <Button
                                    size="icon"
                                    variant="outline"
                                    aria-label={t("newTask")}
                                    onClick={() => openTaskCreate(selectedDay)}
                                >
                                    <Plus size={15} />
                                </Button>
                            ) : null}
                        </div>

                        <div className="scroll-area mt-3 max-h-[360px] space-y-2 overflow-y-auto overscroll-contain pr-1">
                            {tasksLoading ? (
                                <div className="space-y-2">
                                    <div className="h-14 animate-pulse rounded-lg bg-surface-hover" />
                                    <div className="h-14 animate-pulse rounded-lg bg-surface-hover" />
                                </div>
                            ) : selectedTasks.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center">
                                    <SquareCheck
                                        size={20}
                                        className="mx-auto mb-2 text-text-muted"
                                    />
                                    <p className="text-xs text-text-muted">
                                        {t("noTasks")}
                                    </p>
                                </div>
                            ) : (
                                selectedTasks.map((task) => (
                                    <button
                                        key={task.id}
                                        type="button"
                                        onClick={() =>
                                            setDetailTaskId(task.id)
                                        }
                                        className="w-full rounded-xl border border-border bg-surface-elevated/50 p-2.5 text-left transition-colors hover:bg-surface-hover"
                                    >
                                        <div className="flex items-start gap-2">
                                            <span
                                                className="mt-1 size-2 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        projectById.get(
                                                            task.projectId,
                                                        )?.color ??
                                                        "#4F46E5",
                                                }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className={cn(
                                                        "truncate text-xs font-semibold text-text-primary",
                                                        task.status ===
                                                            "completed" &&
                                                            "line-through opacity-60",
                                                    )}
                                                >
                                                    {task.title}
                                                </p>
                                                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
                                                    <SquareCheck size={10} />
                                                    {projectById.get(
                                                        task.projectId,
                                                    )?.name ?? "—"}
                                                </p>
                                                <Badge
                                                    tone={
                                                        statusTone[task.status]
                                                    }
                                                    className="mt-1.5"
                                                >
                                                    {tStatus(task.status)}
                                                </Badge>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                                    {t("events")}
                                </p>
                                <h2 className="mt-1 text-base font-semibold capitalize text-text-primary">
                                    {formatDate(selectedDay, locale, {
                                        weekday: "long",
                                        day: "numeric",
                                        month: "long",
                                    })}
                                </h2>
                            </div>
                            {canEdit ? (
                                <Button
                                    size="icon"
                                    variant="outline"
                                    aria-label={t("newEvent")}
                                    onClick={() => openCreate(selectedDay)}
                                >
                                    <Plus size={15} />
                                </Button>
                            ) : null}
                        </div>

                        <div className="scroll-area mt-3 max-h-[320px] space-y-2 overflow-y-auto overscroll-contain pr-1">
                            {isLoading ? (
                                <div className="space-y-2">
                                    <div className="h-14 animate-pulse rounded-lg bg-surface-hover" />
                                    <div className="h-14 animate-pulse rounded-lg bg-surface-hover" />
                                </div>
                            ) : selectedEvents.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center">
                                    <CalendarDays
                                        size={20}
                                        className="mx-auto mb-2 text-text-muted"
                                    />
                                    <p className="text-xs text-text-muted">
                                        {t("noEvents")}
                                    </p>
                                </div>
                            ) : (
                                selectedEvents.map((event) => (
                                    <button
                                        key={event.id}
                                        type="button"
                                        onClick={() => openEdit(event)}
                                        className="w-full rounded-xl border border-border bg-surface-elevated/50 p-2.5 text-left transition-colors hover:bg-surface-hover"
                                    >
                                        <div className="flex items-start gap-2">
                                            <span
                                                className="mt-1 size-2 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        event.project?.color ??
                                                        event.department
                                                            ?.color ??
                                                        "#4F46E5",
                                                }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold text-text-primary">
                                                    {event.title}
                                                </p>
                                                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
                                                    <Clock size={10} />
                                                    {event.allDay
                                                        ? t("allDay")
                                                        : `${formatTime(
                                                              event.startAt,
                                                              locale,
                                                          )} – ${formatTime(
                                                              event.endAt,
                                                              locale,
                                                          )}`}
                                                </p>
                                                {event.location ? (
                                                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
                                                        <MapPin size={10} />
                                                        {event.location}
                                                    </p>
                                                ) : null}
                                                {event.project ? (
                                                    <Badge
                                                        tone="neutral"
                                                        className="mt-1.5"
                                                    >
                                                        {event.project.name}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                            {t("legend")}
                        </h2>
                        <div className="mt-2 space-y-1.5">
                            {(projectsData?.items ?? [])
                                .slice(0, 8)
                                .map((project) => (
                                    <div
                                        key={project.id}
                                        className="flex items-center gap-2 text-xs text-text-secondary"
                                    >
                                        <span
                                            className="size-2 rounded-full"
                                            style={{
                                                backgroundColor: project.color,
                                            }}
                                        />
                                        <span className="truncate">
                                            {project.name}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            </div>

            <EventFormDialog
                open={formOpen}
                onClose={() => {
                    setFormOpen(false);
                    setEditing(null);
                }}
                event={editing}
                defaultDate={defaultDate}
            />

            <TaskFormDialog
                open={taskFormOpen}
                onClose={() => {
                    setTaskFormOpen(false);
                    setEditingTask(null);
                }}
                task={editingTask}
                defaultDueDate={defaultDueDate}
                onSaved={(task) => setDetailTaskId(task.id)}
            />

            <TaskDetailDialog
                taskId={detailTaskId}
                open={Boolean(detailTaskId)}
                onClose={() => {
                    setDetailTaskId(null);
                    setEditingTask(null);
                }}
                onEdit={openTaskEdit}
                onDeleted={() => {
                    setDetailTaskId(null);
                    setEditingTask(null);
                }}
            />
        </div>
    );
}
