"use client";
import { useLocale, useTranslations } from "next-intl";
import { taskflowApi } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { getApiErrorMessage } from "@/lib/utils";
type Session = {
    id: string;
    createdAt: string;
    lastUsedAt: string;
    userAgent: string | null;
    current: boolean;
};
const api = taskflowApi.injectEndpoints({
    endpoints: (b) => ({
        getSessions: b.query<Session[], void>({
            query: () => "/auth/sessions",
            transformResponse: (r: { data: Session[] }) => r.data,
            providesTags: ["Me"],
        }),
        revokeSession: b.mutation<void, string | undefined>({
            query: (id) => ({
                url: `/auth/sessions${id ? `?id=${encodeURIComponent(id)}` : ""}`,
                method: "DELETE",
            }),
            invalidatesTags: ["Me"],
        }),
    }),
});
export function SessionSettings() {
    const t = useTranslations("sessions");
    const locale = useLocale();
    const router = useRouter();
    const toast = useToast();
    const { data } = api.useGetSessionsQuery();
    const [revoke, state] = api.useRevokeSessionMutation();
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">{t("title")}</h2>
            <ul className="my-3 space-y-3">
                {data?.map((s) => (
                    <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                        <div>
                            <p className="max-w-lg truncate">
                                {s.current
                                    ? t("current")
                                    : (s.userAgent ?? t("device"))}
                            </p>
                            <p className="text-xs text-text-muted">
                                {t("lastUsed")}:{" "}
                                {new Date(s.lastUsedAt).toLocaleString(locale)}
                            </p>
                        </div>
                        {!s.current ? (
                            <Button
                                variant="outline"
                                disabled={state.isLoading}
                                onClick={() =>
                                    void revoke(s.id)
                                        .unwrap()
                                        .catch((e) =>
                                            toast.error(
                                                getApiErrorMessage(
                                                    e,
                                                    t("error"),
                                                ),
                                            ),
                                        )
                                }
                            >
                                {t("revoke")}
                            </Button>
                        ) : null}
                    </li>
                ))}
            </ul>
            <Button
                variant="outline"
                loading={state.isLoading}
                onClick={() => {
                    if (window.confirm(t("confirm")))
                        void revoke(undefined)
                            .unwrap()
                            .then(() => router.replace("/login"))
                            .catch((e) =>
                                toast.error(getApiErrorMessage(e, t("error"))),
                            );
                }}
            >
                {t("all")}
            </Button>
        </section>
    );
}
