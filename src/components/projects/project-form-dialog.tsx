"use client";

import {useTranslations} from "next-intl";
import {useEffect, useState} from "react";

import {Button} from "@/components/ui/button";
import {Field, Input, Select, Textarea} from "@/components/ui/input";
import {Modal} from "@/components/ui/modal";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {projectStatuses} from "@/lib/domain";
import {
    useCreateProjectMutation,
    useGetDepartmentsQuery,
    useGetWorkspaceMembersQuery,
    useUpdateProjectMutation,
} from "@/lib/redux/api";
import type {Project, ProjectCreateInput} from "@/lib/redux/types";
import {
    dateInputToIso,
    getApiErrorMessage,
    toDateInputValue,
} from "@/lib/utils";

const colors = [
    "#4F46E5",
    "#2563EB",
    "#0891B2",
    "#059669",
    "#D97706",
    "#DC2626",
    "#DB2777",
    "#7C3AED",
];

export function ProjectFormDialog({
    open,
    onClose,
    project = null,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    project?: Project | null;
    onSaved?: (project: Project) => void;
}) {
    const t = useTranslations("projectForm");
    const tCommon = useTranslations("common");
    const tStatus = useTranslations("projectStatus");
    const toast = useToast();
    const {workspace, canEdit} = useWorkspace();

    const {data: departments} = useGetDepartmentsQuery(undefined, {
        skip: !open,
    });
    const {data: members} = useGetWorkspaceMembersQuery(
        {workspaceId: workspace.id},
        {skip: !open},
    );

    const [createProject, createState] = useCreateProjectMutation();
    const [updateProject, updateState] = useUpdateProjectMutation();
    const saving = createState.isLoading || updateState.isLoading;

    const [name, setName] = useState("");
    const [key, setKey] = useState("");
    const [description, setDescription] = useState("");
    const [departmentId, setDepartmentId] = useState("");
    const [status, setStatus] =
        useState<(typeof projectStatuses)[number]>("active");
    const [color, setColor] = useState(colors[0]);
    const [ownerId, setOwnerId] = useState("");
    const [startDate, setStartDate] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isEdit = Boolean(project?.id);

    useEffect(() => {
        if (!open) return;
        setErrors({});
        if (project) {
            setName(project.name);
            setKey(project.key);
            setDescription(project.description ?? "");
            setDepartmentId(project.departmentId);
            setStatus(project.status);
            setColor(project.color);
            setOwnerId(project.ownerId);
            setStartDate(toDateInputValue(project.startDate));
            setDueDate(toDateInputValue(project.dueDate));
        } else {
            setName("");
            setKey("");
            setDescription("");
            setDepartmentId(departments?.[0]?.id ?? "");
            setStatus("active");
            setColor(colors[0]);
            setOwnerId("");
            setStartDate("");
            setDueDate("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, project?.id]);

    useEffect(() => {
        if (open && !departmentId && departments && departments.length > 0) {
            setDepartmentId(departments[0].id);
        }
    }, [open, departmentId, departments]);

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (name.trim().length < 2) nextErrors.name = t("nameRequired");
        if (!/^[A-Z0-9-]{2,12}$/.test(key.trim().toUpperCase())) {
            nextErrors.key = t("keyInvalid");
        }
        if (!departmentId) nextErrors.department = t("departmentRequired");
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        const payload: ProjectCreateInput = {
            workspaceId: workspace.id,
            departmentId,
            name: name.trim(),
            key: key.trim().toUpperCase(),
            description: description.trim() || null,
            color,
            status,
            ownerId: ownerId || undefined,
            startDate: dateInputToIso(startDate),
            dueDate: dateInputToIso(dueDate, true),
        };

        try {
            let saved: Project;
            if (project?.id) {
                saved = await updateProject({
                    id: project.id,
                    data: payload,
                }).unwrap();
                toast.success(t("updated"));
            } else {
                const record = await createProject(payload).unwrap();
                saved = {
                    ...record,
                    department:
                        departments?.find(
                            (item) => item.id === record.departmentId,
                        ) ?? {
                            id: record.departmentId,
                            name: "—",
                            slug: "",
                            color: record.color,
                        },
                    owner: null,
                    taskCount: 0,
                };
                toast.success(t("created"));
            }
            onSaved?.(saved);
            onClose();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("saveError")));
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={isEdit ? t("editTitle") : t("createTitle")}
            description={
                isEdit ? t("editDescription") : t("createDescription")
            }
            size="lg"
            closeLabel={tCommon("close")}
            footer={
                <>
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
                    label={t("name")}
                    htmlFor="project-name"
                    required
                    error={errors.name}
                >
                    <Input
                        id="project-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t("namePlaceholder")}
                        maxLength={140}
                        autoFocus
                    />
                </Field>

                <Field
                    label={t("key")}
                    htmlFor="project-key"
                    required
                    hint={t("keyHint")}
                    error={errors.key}
                >
                    <Input
                        id="project-key"
                        value={key}
                        onChange={(event) =>
                            setKey(event.target.value.toUpperCase())
                        }
                        placeholder="ENG-1"
                        maxLength={12}
                    />
                </Field>

                <Field
                    className="sm:col-span-2"
                    label={t("description")}
                    htmlFor="project-description"
                >
                    <Textarea
                        id="project-description"
                        value={description}
                        onChange={(event) =>
                            setDescription(event.target.value)
                        }
                        placeholder={t("descriptionPlaceholder")}
                        maxLength={2000}
                    />
                </Field>

                <Field
                    label={t("department")}
                    htmlFor="project-department"
                    required
                    error={errors.department}
                >
                    <Select
                        id="project-department"
                        value={departmentId}
                        onChange={(event) =>
                            setDepartmentId(event.target.value)
                        }
                    >
                        {(departments ?? []).map((department) => (
                            <option key={department.id} value={department.id}>
                                {department.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label={t("owner")} htmlFor="project-owner">
                    <Select
                        id="project-owner"
                        value={ownerId}
                        onChange={(event) => setOwnerId(event.target.value)}
                    >
                        <option value="">{t("ownerPlaceholder")}</option>
                        {(members ?? []).map((member) => (
                            <option key={member.user.id} value={member.user.id}>
                                {member.user.name}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label={t("status")} htmlFor="project-status">
                    <Select
                        id="project-status"
                        value={status}
                        onChange={(event) =>
                            setStatus(
                                event.target
                                    .value as (typeof projectStatuses)[number],
                            )
                        }
                    >
                        {projectStatuses.map((item) => (
                            <option key={item} value={item}>
                                {tStatus(item)}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field label={t("color")}>
                    <div className="flex flex-wrap items-center gap-2">
                        {colors.map((item) => (
                            <button
                                key={item}
                                type="button"
                                aria-label={item}
                                aria-pressed={color === item}
                                onClick={() => setColor(item)}
                                className="size-7 rounded-full ring-offset-2 ring-offset-surface transition-shadow"
                                style={{
                                    backgroundColor: item,
                                    boxShadow:
                                        color === item
                                            ? `0 0 0 2px ${item}`
                                            : undefined,
                                }}
                            />
                        ))}
                    </div>
                </Field>

                <Field label={t("startDate")} htmlFor="project-start">
                    <Input
                        id="project-start"
                        type="date"
                        value={startDate}
                        onChange={(event) =>
                            setStartDate(event.target.value)
                        }
                    />
                </Field>

                <Field label={t("dueDate")} htmlFor="project-due">
                    <Input
                        id="project-due"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                    />
                </Field>
            </div>
        </Modal>
    );
}
