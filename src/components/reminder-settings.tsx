"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
    useGetSettingsQuery,
    useUpdateSettingsMutation,
} from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
export function ReminderSettings() {
    const t = useTranslations("reminders");
    const { data } = useGetSettingsQuery();
    const [update, state] = useUpdateSettingsMutation();
    const toast = useToast();
    const [hours, setHours] = useState<string | null>(null);
    return (
        <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">{t("title")}</h2>
            <p className="mt-1 text-sm text-text-secondary">
                {t("description")}
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    disabled={!data || state.isLoading}
                    checked={data?.taskReminders ?? true}
                    onChange={(e) =>
                        void update({ taskReminders: e.target.checked })
                            .unwrap()
                            .catch((error) =>
                                toast.error(
                                    getApiErrorMessage(error, t("error")),
                                ),
                            )
                    }
                />
                {t("enabled")}
            </label>
            <label className="mt-3 block text-sm">
                {t("hours")}
                <Input
                    className="mt-1 max-w-xs"
                    value={hours ?? data?.reminderHours ?? "24,5,1"}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="24,5,1"
                />
            </label>
            <Button
                className="mt-3"
                loading={state.isLoading}
                disabled={!data}
                onClick={() =>
                    void update({
                        reminderHours: hours ?? data?.reminderHours ?? "24,5,1",
                    })
                        .unwrap()
                        .then(() => toast.success(t("saved")))
                        .catch((error) =>
                            toast.error(getApiErrorMessage(error, t("error"))),
                        )
                }
            >
                {t("save")}
            </Button>
        </section>
    );
}
