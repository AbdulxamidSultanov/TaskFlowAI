"use client";

import {useTranslations} from "next-intl";
import {Eye, EyeOff, LockKeyhole, Mail, Sparkles} from "lucide-react";
import {useState} from "react";

import {Button} from "@/components/ui/button";
import {Field, Input} from "@/components/ui/input";
import {useToast} from "@/components/ui/toast";
import {Link, useRouter} from "@/i18n/navigation";
import {useLoginMutation} from "@/lib/redux/api";
import {getApiErrorMessage, getApiErrorStatus} from "@/lib/utils";

export default function LoginPage() {
    const t = useTranslations("auth");
    const tCommon = useTranslations("common");
    const router = useRouter();
    const toast = useToast();
    const [login, {isLoading}] = useLoginMutation();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");

        try {
            await login({email: email.trim(), password}).unwrap();
            toast.success(t("welcomeBack"));
            router.replace("/dashboard");
            router.refresh();
        } catch (submitError) {
            if (getApiErrorStatus(submitError) === 401) {
                setError(t("invalidCredentials"));
            } else {
                setError(getApiErrorMessage(submitError, t("loginError")));
            }
        }
    };

    return (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="mb-6">
                <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles size={20} />
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                    {t("loginTitle")}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                    {t("loginSubtitle")}
                </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
                <Field label={t("email")} htmlFor="email" required>
                    <div className="relative">
                        <Mail
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@taskflow.ai"
                            className="pl-9"
                        />
                    </div>
                </Field>

                <Field label={t("password")} htmlFor="password" required>
                    <div className="relative">
                        <LockKeyhole
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            placeholder="••••••••"
                            className="px-9"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={
                                showPassword ? t("hidePassword") : t("showPassword")
                            }
                            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
                        >
                            {showPassword ? (
                                <EyeOff size={15} />
                            ) : (
                                <Eye size={15} />
                            )}
                        </button>
                    </div>
                </Field>

                {error ? (
                    <p
                        role="alert"
                        className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error"
                    >
                        {error}
                    </p>
                ) : null}

                <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    loading={isLoading}
                >
                    {t("signIn")}
                </Button>
            </form>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-elevated/60 p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-primary">
                            {t("demoTitle")}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                            demo@taskflow.ai · Demo1234!
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setEmail("demo@taskflow.ai");
                            setPassword("Demo1234!");
                            setError("");
                        }}
                        className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-primary hover:bg-surface-hover"
                    >
                        {t("useDemo")}
                    </button>
                </div>
            </div>

            <p className="mt-6 text-center text-sm text-text-secondary">
                {t("noAccount")}{" "}
                <Link
                    href="/register"
                    className="font-medium text-primary hover:underline"
                >
                    {t("signUp")}
                </Link>
            </p>
            <p className="sr-only">{tCommon("loading")}</p>
        </div>
    );
}
