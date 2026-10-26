"use client";

import {useTranslations} from "next-intl";
import {useEffect, useState} from "react";

import {Button} from "@/components/ui/button";
import {Checkbox, Field, Input, Select} from "@/components/ui/input";
import {Modal} from "@/components/ui/modal";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {userRoles} from "@/lib/domain";
import {
    useCreateUserMutation,
    useGetDepartmentsQuery,
    useUpdateUserMutation,
} from "@/lib/redux/api";
import type {User, UserCreateInput, UserUpdateInput} from "@/lib/redux/types";
import {getApiErrorMessage} from "@/lib/utils";

const timezones = [
    "Asia/Tashkent",
    "Asia/Almaty",
    "Europe/Moscow",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Tokyo",
];

export function UserFormDialog({
    open,
    onClose,
    user = null,
}: {
    open: boolean;
    onClose: () => void;
    user?: User | null;
}) {
    const t = useTranslations("userForm");
    const tCommon = useTranslations("common");
    const tRole = useTranslations("role");
    const toast = useToast();
    const {isGlobalAdmin, canManageUsers} = useWorkspace();
    const {data: departments} = useGetDepartmentsQuery(undefined, {
        skip: !open,
    });

    const [createUser, createState] = useCreateUserMutation();
    const [updateUser, updateState] = useUpdateUserMutation();
    const saving = createState.isLoading || updateState.isLoading;

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<(typeof userRoles)[number]>("member");
    const [departmentId, setDepartmentId] = useState("");
    const [jobTitle, setJobTitle] = useState("");
    const [timezone, setTimezone] = useState("Asia/Tashkent");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isEdit = Boolean(user?.id);

    useEffect(() => {
        if (!open) return;
        setErrors({});
        if (user) {
            setName(user.name);
            setEmail(user.email);
            setPassword("");
            setRole(user.role);
            setDepartmentId(user.departmentId ?? "");
            setJobTitle(user.jobTitle ?? "");
            setTimezone(user.timezone);
            setAvatarUrl(user.avatarUrl ?? "");
            setIsActive(user.isActive);
        } else {
            setName("");
            setEmail("");
            setPassword("");
            setRole("member");
            setDepartmentId("");
            setJobTitle("");
            setTimezone("Asia/Tashkent");
            setAvatarUrl("");
            setIsActive(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, user?.id]);

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (name.trim().length < 2) nextErrors.name = t("nameRequired");
        if (!email.includes("@")) nextErrors.email = t("emailInvalid");
        if (!isEdit && password.length < 8) {
            nextErrors.password = t("passwordRequired");
        }
        if (isEdit && password && password.length < 8) {
            nextErrors.password = t("passwordShort");
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        try {
            if (isEdit && user) {
                const data: UserUpdateInput = {
                    name: name.trim(),
                    email: email.trim(),
                    role,
                    departmentId: departmentId || null,
                    jobTitle: jobTitle.trim() || null,
                    timezone,
                    avatarUrl: avatarUrl.trim() || null,
                    isActive,
                    ...(password ? {password} : {}),
                };
                await updateUser({id: user.id, data}).unwrap();
                toast.success(t("updated"));
            } else {
                const data: UserCreateInput = {
                    name: name.trim(),
                    email: email.trim(),
                    password,
                    role,
                    departmentId: departmentId || null,
                    jobTitle: jobTitle.trim() || null,
                    timezone,
                    avatarUrl: avatarUrl.trim() || undefined,
                };
                await createUser(data).unwrap();
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
                        disabled={!canManageUsers && !isEdit}
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
                        onChange={(event) => setName(event.target.value)}
                        autoFocus
                    />
                </Field>
                <Field
                    label={t("email")}
                    required
                    error={errors.email}
                >
                    <Input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                </Field>
                <Field
                    label={isEdit ? t("newPassword") : t("password")}
                    required={!isEdit}
                    hint={isEdit ? t("passwordEditHint") : t("passwordHint")}
                    error={errors.password}
                >
                    <Input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                    />
                </Field>
                <Field label={t("jobTitle")}>
                    <Input
                        value={jobTitle}
                        onChange={(event) => setJobTitle(event.target.value)}
                        placeholder={t("jobTitlePlaceholder")}
                    />
                </Field>
                <Field label={t("role")}>
                    <Select
                        value={role}
                        onChange={(event) =>
                            setRole(
                                event.target
                                    .value as (typeof userRoles)[number],
                            )
                        }
                        disabled={!isGlobalAdmin}
                    >
                        {userRoles
                            .filter(
                                (item) => isGlobalAdmin || item !== "admin",
                            )
                            .map((item) => (
                                <option key={item} value={item}>
                                    {tRole(item)}
                                </option>
                            ))}
                    </Select>
                </Field>
                <Field label={t("department")}>
                    <Select
                        value={departmentId}
                        onChange={(event) =>
                            setDepartmentId(event.target.value)
                        }
                        disabled={!isGlobalAdmin}
                    >
                        <option value="">{t("noDepartment")}</option>
                        {(departments ?? []).map((department) => (
                            <option key={department.id} value={department.id}>
                                {department.name}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label={t("timezone")}>
                    <Select
                        value={timezone}
                        onChange={(event) => setTimezone(event.target.value)}
                    >
                        {timezones.map((zone) => (
                            <option key={zone} value={zone}>
                                {zone}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label={t("avatarUrl")}>
                    <Input
                        value={avatarUrl}
                        onChange={(event) => setAvatarUrl(event.target.value)}
                        placeholder="https://..."
                    />
                </Field>
                {isEdit && isGlobalAdmin ? (
                    <div className="sm:col-span-2">
                        <Checkbox
                            checked={isActive}
                            onChange={(event) =>
                                setIsActive(event.target.checked)
                            }
                            label={t("activeAccount")}
                            description={t("activeAccountDescription")}
                        />
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}
