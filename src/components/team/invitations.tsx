"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { taskflowApi } from "@/lib/redux/api";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";
const api = taskflowApi.injectEndpoints({
    endpoints: (b) => ({
        invite: b.mutation<
            { token: string },
            { workspaceId: string; email: string }
        >({
            query: (body) => ({ url: "/invitations", method: "POST", body }),
            transformResponse: (r: { data: { token: string } }) => r.data,
        }),
        acceptInvite: b.mutation<unknown, string>({
            query: (token) => ({
                url: "/invitations/accept",
                method: "POST",
                body: { token },
            }),
            invalidatesTags: [
                "Me",
                "Workspace",
                "WorkspaceMember",
                "User",
                "Project",
                "Task",
            ],
        }),
    }),
});
export function Invitations() {
    const t = useTranslations("invitations");
    const { workspace, canManageWorkspace } = useWorkspace();
    const toast = useToast();
    const [email, setEmail] = useState("");
    const [token, setToken] = useState("");
    const [issued, setIssued] = useState("");
    const [invite, issueState] = api.useInviteMutation();
    const [accept, acceptState] = api.useAcceptInviteMutation();
    const fail = (e: unknown) => toast.error(getApiErrorMessage(e, t("error")));
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">{t("title")}</h2>
            <p className="mt-1 text-sm text-text-secondary">
                {t("description")}
            </p>
            {canManageWorkspace ? (
                <div className="mt-4">
                    <label className="text-sm">
                        {t("email")}
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>
                    <Button
                        className="mt-2"
                        disabled={!email}
                        loading={issueState.isLoading}
                        onClick={() =>
                            void invite({ workspaceId: workspace.id, email })
                                .unwrap()
                                .then((r) => setIssued(r.token))
                                .catch(fail)
                        }
                    >
                        {t("create")}
                    </Button>
                    {issued ? (
                        <div className="mt-3">
                            <p className="text-sm">{t("share")}</p>
                            <Input
                                aria-label={t("code")}
                                readOnly
                                value={issued}
                                onFocus={(e) => e.target.select()}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="mt-4">
                <label className="text-sm">
                    {t("code")}
                    <Input
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoComplete="off"
                    />
                </label>
                <Button
                    className="mt-2"
                    disabled={token.length < 16}
                    loading={acceptState.isLoading}
                    onClick={() =>
                        void accept(token)
                            .unwrap()
                            .then(() => {
                                setToken("");
                                toast.success(t("accepted"));
                            })
                            .catch(fail)
                    }
                >
                    {t("accept")}
                </Button>
            </div>
        </section>
    );
}
