"use client";

import {useTranslations} from "next-intl";
import {useEffect, useState} from "react";

import {Button} from "@/components/ui/button";
import {Field, Select} from "@/components/ui/input";
import {Modal} from "@/components/ui/modal";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {workspaceRoles} from "@/lib/domain";
import {
    useAddWorkspaceMemberMutation,
    useGetUsersQuery,
    useGetWorkspaceMembersQuery,
} from "@/lib/redux/api";
import {getApiErrorMessage} from "@/lib/utils";

export function MemberFormDialog({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const t = useTranslations("memberForm");
    const tCommon = useTranslations("common");
    const tRole = useTranslations("workspaceRole");
    const toast = useToast();
    const {workspace} = useWorkspace();

    const {data: usersData} = useGetUsersQuery(
        {pageSize: 100},
        {skip: !open},
    );
    const {data: members} = useGetWorkspaceMembersQuery(
        {workspaceId: workspace.id},
        {skip: !open},
    );
    const [addMember, addState] = useAddWorkspaceMemberMutation();

    const [userId, setUserId] = useState("");
    const [role, setRole] = useState<(typeof workspaceRoles)[number]>("member");
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        setUserId("");
        setRole("member");
        setErrors({});
    }, [open]);

    const memberIds = new Set(
        (members ?? []).map((member) => member.user.id),
    );
    const availableUsers = (usersData?.items ?? []).filter(
        (user) => !memberIds.has(user.id),
    );

    const submit = async () => {
        if (!userId) {
            setErrors({user: t("userRequired")});
            return;
        }
        try {
            await addMember({
                workspaceId: workspace.id,
                data: {userId, role},
            }).unwrap();
            toast.success(t("added"));
            onClose();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("addError")));
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={t("title")}
            description={t("description")}
            size="sm"
            closeLabel={tCommon("close")}
            footer={
                <>
                    <Button variant="outline" onClick={onClose}>
                        {tCommon("cancel")}
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        loading={addState.isLoading}
                        disabled={availableUsers.length === 0}
                    >
                        {t("add")}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field
                    label={t("user")}
                    required
                    error={errors.user}
                >
                    <Select
                        value={userId}
                        onChange={(event) => setUserId(event.target.value)}
                    >
                        <option value="">{t("userPlaceholder")}</option>
                        {availableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.name} · {user.email}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label={t("role")} hint={t("roleHint")}>
                    <Select
                        value={role}
                        onChange={(event) =>
                            setRole(
                                event.target
                                    .value as (typeof workspaceRoles)[number],
                            )
                        }
                    >
                        {workspaceRoles
                            .filter((item) => item !== "owner")
                            .map((item) => (
                                <option key={item} value={item}>
                                    {tRole(item)}
                                </option>
                            ))}
                    </Select>
                </Field>
                {availableUsers.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                        {t("noAvailableUsers")}
                    </p>
                ) : null}
            </div>
        </Modal>
    );
}
