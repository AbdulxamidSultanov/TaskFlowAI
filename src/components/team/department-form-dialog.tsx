"use client";

import {useTranslations} from "next-intl";
import {useEffect, useState} from "react";

import {Button} from "@/components/ui/button";
import {Field, Input, Textarea} from "@/components/ui/input";
import {Modal} from "@/components/ui/modal";
import {useToast} from "@/components/ui/toast";
import {
    useCreateDepartmentMutation,
    useUpdateDepartmentMutation,
} from "@/lib/redux/api";
import type {DepartmentWithCounts} from "@/lib/redux/types";
import {getApiErrorMessage} from "@/lib/utils";

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

export function DepartmentFormDialog({
    open,
    onClose,
    department = null,
}: {
    open: boolean;
    onClose: () => void;
    department?: DepartmentWithCounts | null;
}) {
    const t = useTranslations("departmentForm");
    const tCommon = useTranslations("common");
    const toast = useToast();

    const [createDepartment, createState] = useCreateDepartmentMutation();
    const [updateDepartment, updateState] = useUpdateDepartmentMutation();
    const saving = createState.isLoading || updateState.isLoading;

    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState(colors[0]);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isEdit = Boolean(department?.id);

    useEffect(() => {
        if (!open) return;
        setErrors({});
        if (department) {
            setName(department.name);
            setSlug(department.slug);
            setDescription(department.description ?? "");
            setColor(department.color);
        } else {
            setName("");
            setSlug("");
            setDescription("");
            setColor(colors[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, department?.id]);

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (name.trim().length < 2) nextErrors.name = t("nameRequired");
        if (!/^[a-z0-9-]{2,80}$/.test(slug.trim())) {
            nextErrors.slug = t("slugInvalid");
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        try {
            if (isEdit && department) {
                await updateDepartment({
                    id: department.id,
                    data: {
                        name: name.trim(),
                        slug: slug.trim(),
                        description: description.trim() || null,
                        color,
                    },
                }).unwrap();
                toast.success(t("updated"));
            } else {
                await createDepartment({
                    name: name.trim(),
                    slug: slug.trim(),
                    description: description.trim() || null,
                    color,
                }).unwrap();
                toast.success(t("created"));
            }
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
            description={isEdit ? t("editDescription") : t("createDescription")}
            closeLabel={tCommon("close")}
            footer={
                <>
                    <Button variant="outline" onClick={onClose}>
                        {tCommon("cancel")}
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        loading={saving}
                    >
                        {isEdit ? tCommon("saveChanges") : t("create")}
                    </Button>
                </>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field
                    label={t("name")}
                    required
                    error={errors.name}
                >
                    <Input
                        value={name}
                        onChange={(event) => {
                            setName(event.target.value);
                            if (!isEdit) {
                                setSlug(
                                    event.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9-]+/g, "-")
                                        .replace(/^-+|-+$/g, ""),
                                );
                            }
                        }}
                        autoFocus
                    />
                </Field>
                <Field
                    label={t("slug")}
                    required
                    hint={t("slugHint")}
                    error={errors.slug}
                >
                    <Input
                        value={slug}
                        onChange={(event) =>
                            setSlug(
                                event.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9-]+/g, "-"),
                            )
                        }
                    />
                </Field>
                <Field
                    className="sm:col-span-2"
                    label={t("description")}
                >
                    <Textarea
                        value={description}
                        onChange={(event) =>
                            setDescription(event.target.value)
                        }
                        maxLength={500}
                    />
                </Field>
                <Field className="sm:col-span-2" label={t("color")}>
                    <div className="flex flex-wrap gap-2">
                        {colors.map((item) => (
                            <button
                                key={item}
                                type="button"
                                aria-label={item}
                                aria-pressed={color === item}
                                onClick={() => setColor(item)}
                                className="size-7 rounded-full"
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
            </div>
        </Modal>
    );
}
