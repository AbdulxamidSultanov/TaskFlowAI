"use client";

import {useTranslations} from "next-intl";
import {Trash2} from "lucide-react";
import {useEffect, useState} from "react";

import {Button} from "@/components/ui/button";
import {Checkbox, Field, Input, Select, Textarea} from "@/components/ui/input";
import {ConfirmDialog, Modal} from "@/components/ui/modal";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {
    useCreateCalendarEventMutation,
    useDeleteCalendarEventMutation,
    useGetProjectsQuery,
    useUpdateCalendarEventMutation,
} from "@/lib/redux/api";
import type {
    CalendarEvent,
    CalendarEventCreateInput,
} from "@/lib/redux/types";
import {
    dateTimeLocalToIso,
    getApiErrorMessage,
    toDateTimeLocalValue,
} from "@/lib/utils";

function defaultTimes(date?: Date) {
    const start = new Date(date ?? new Date());
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);
    return {start, end};
}

export function EventFormDialog({
    open,
    onClose,
    event = null,
    defaultDate,
}: {
    open: boolean;
    onClose: () => void;
    event?: CalendarEvent | null;
    defaultDate?: Date;
}) {
    const t = useTranslations("eventForm");
    const tCommon = useTranslations("common");
    const toast = useToast();
    const {workspace, canEdit} = useWorkspace();

    const {data: projectsData} = useGetProjectsQuery(
        {workspaceId: workspace.id, pageSize: 100},
        {skip: !open},
    );

    const [createEvent, createState] = useCreateCalendarEventMutation();
    const [updateEvent, updateState] = useUpdateCalendarEventMutation();
    const [deleteEvent, deleteState] = useDeleteCalendarEventMutation();
    const saving = createState.isLoading || updateState.isLoading;

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");
    const [allDay, setAllDay] = useState(false);
    const [location, setLocation] = useState("");
    const [projectId, setProjectId] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [confirmDelete, setConfirmDelete] = useState(false);

    const isEdit = Boolean(event?.id);

    useEffect(() => {
        if (!open) return;
        setErrors({});
        setConfirmDelete(false);
        if (event) {
            setTitle(event.title);
            setDescription(event.description ?? "");
            setStartAt(toDateTimeLocalValue(event.startAt));
            setEndAt(toDateTimeLocalValue(event.endAt));
            setAllDay(event.allDay);
            setLocation(event.location ?? "");
            setProjectId(event.projectId ?? "");
        } else {
            const {start, end} = defaultTimes(defaultDate);
            setTitle("");
            setDescription("");
            setStartAt(toDateTimeLocalValue(start));
            setEndAt(toDateTimeLocalValue(end));
            setAllDay(false);
            setLocation("");
            setProjectId("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, event?.id]);

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        const startIso = dateTimeLocalToIso(startAt);
        const endIso = dateTimeLocalToIso(endAt);

        if (title.trim().length < 2) nextErrors.title = t("titleRequired");
        if (!startIso) nextErrors.startAt = t("startRequired");
        if (!endIso) nextErrors.endAt = t("endRequired");
        if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
            nextErrors.endAt = t("endAfterStart");
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0 || !startIso || !endIso) return;

        const payload: CalendarEventCreateInput = {
            workspaceId: workspace.id,
            title: title.trim(),
            description: description.trim() || null,
            startAt: startIso,
            endAt: endIso,
            allDay,
            location: location.trim() || null,
            projectId: projectId || null,
        };

        try {
            if (event?.id) {
                await updateEvent({id: event.id, data: payload}).unwrap();
                toast.success(t("updated"));
            } else {
                await createEvent(payload).unwrap();
                toast.success(t("created"));
            }
            onClose();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("saveError")));
        }
    };

    const remove = async () => {
        if (!event) return;
        try {
            await deleteEvent({id: event.id}).unwrap();
            toast.success(t("deleted"));
            setConfirmDelete(false);
            onClose();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("deleteError")));
        }
    };

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title={isEdit ? t("editTitle") : t("createTitle")}
                description={
                    isEdit ? t("editDescription") : t("createDescription")
                }
                closeLabel={tCommon("close")}
                footer={
                    <>
                        {isEdit && canEdit ? (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setConfirmDelete(true)}
                                className="mr-auto"
                            >
                                <Trash2 size={14} />
                                {tCommon("delete")}
                            </Button>
                        ) : null}
                        <Button variant="outline" onClick={onClose}>
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            onClick={() => void submit()}
                            loading={saving}
                            disabled={!canEdit}
                        >
                            {isEdit ? tCommon("saveChanges") : t("create")}
                        </Button>
                    </>
                }
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                        className="sm:col-span-2"
                        label={t("title")}
                        htmlFor="event-title"
                        required
                        error={errors.title}
                    >
                        <Input
                            id="event-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder={t("titlePlaceholder")}
                            maxLength={240}
                            autoFocus
                        />
                    </Field>

                    <Field
                        label={t("startAt")}
                        htmlFor="event-start"
                        required
                        error={errors.startAt}
                    >
                        <Input
                            id="event-start"
                            type="datetime-local"
                            value={startAt}
                            onChange={(event) =>
                                setStartAt(event.target.value)
                            }
                        />
                    </Field>

                    <Field
                        label={t("endAt")}
                        htmlFor="event-end"
                        required
                        error={errors.endAt}
                    >
                        <Input
                            id="event-end"
                            type="datetime-local"
                            value={endAt}
                            onChange={(event) => setEndAt(event.target.value)}
                        />
                    </Field>

                    <Field label={t("project")} htmlFor="event-project">
                        <Select
                            id="event-project"
                            value={projectId}
                            onChange={(event) =>
                                setProjectId(event.target.value)
                            }
                        >
                            <option value="">{t("noProject")}</option>
                            {(projectsData?.items ?? []).map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label={t("location")} htmlFor="event-location">
                        <Input
                            id="event-location"
                            value={location}
                            onChange={(event) =>
                                setLocation(event.target.value)
                            }
                            placeholder={t("locationPlaceholder")}
                            maxLength={240}
                        />
                    </Field>

                    <Field
                        className="sm:col-span-2"
                        label={t("description")}
                        htmlFor="event-description"
                    >
                        <Textarea
                            id="event-description"
                            value={description}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                            placeholder={t("descriptionPlaceholder")}
                            maxLength={5000}
                        />
                    </Field>

                    <div className="sm:col-span-2">
                        <Checkbox
                            checked={allDay}
                            onChange={(event) =>
                                setAllDay(event.target.checked)
                            }
                            label={t("allDay")}
                            description={t("allDayDescription")}
                        />
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title={t("deleteTitle")}
                description={t("deleteDescription")}
                confirmLabel={tCommon("delete")}
                cancelLabel={tCommon("cancel")}
                loading={deleteState.isLoading}
                onConfirm={() => void remove()}
            />
        </>
    );
}
