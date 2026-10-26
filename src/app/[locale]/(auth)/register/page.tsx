"use client";

import {useTranslations} from "next-intl";
import {
    Eye,
    EyeOff,
    LockKeyhole,
    Mail,
    Sparkles,
    UserRound,
} from "lucide-react";
import {useState} from "react";

import {Button} from "@/components/ui/button";
import {Field, Input} from "@/components/ui/input";
import {useToast} from "@/components/ui/toast";
import {Link, useRouter} from "@/i18n/navigation";
import {useRegisterMutation} from "@/lib/redux/api";
import {getApiErrorMessage, getApiErrorStatus} from "@/lib/utils";

export default function RegisterPage() {
    const t = useTranslations("auth");
    const router = useRouter();
    const toast = useToast();
    const [register, {isLoading}] = useRegisterMutation();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        const errors: Record<string, string> = {};

        if (name.trim().length < 2) errors.name = t("nameRequired");
        if (!email.includes("@")) errors.email = t("emailInvalid");
        if (password.length < 8) errors.password = t("passwordTooShort");
        if (password !== confirm) errors.confirm = t("passwordsMismatch");
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        try {
            await register({
                name: name.trim(),
                email: email.trim(),
                password,
            }).unwrap();
            toast.success(t("accountCreated"));
            router.replace("/dashboard");
            router.refresh();
        } catch (submitError) {
            if (getApiErrorStatus(submitError) === 409) {
                setError(t("emailTaken"));
            } else {
                setError(getApiErrorMessage(submitError, t("registerError")));
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
                    {t("registerTitle")}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                    {t("registerSubtitle")}
                </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
                <Field
                    label={t("fullName")}
                    htmlFor="name"
                    required
                    error={fieldErrors.name}
                >
                    <div className="relative">
                        <UserRound
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <Input
                            id="name"
                            autoComplete="name"
                            required
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Alex Morgan"
                            className="pl-9"
                        />
                    </div>
                </Field>

                <Field
                    label={t("email")}
                    htmlFor="email"
                    required
                    error={fieldErrors.email}
                >
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

                <Field
                    label={t("password")}
                    htmlFor="password"
                    required
                    hint={t("passwordHint")}
                    error={fieldErrors.password}
                >
                    <div className="relative">
                        <LockKeyhole
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
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
                                showPassword
                                    ? t("hidePassword")
                                    : t("showPassword")
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

                <Field
                    label={t("confirmPassword")}
                    htmlFor="confirm"
                    required
                    error={fieldErrors.confirm}
                >
                    <Input
                        id="confirm"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder="••••••••"
                    />
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
                    {t("createAccount")}
                </Button>
            </form>

            <p className="mt-5 text-center text-xs text-text-muted">
                {t("registerNote")}
            </p>

            <p className="mt-6 text-center text-sm text-text-secondary">
                {t("haveAccount")}{" "}
                <Link
                    href="/login"
                    className="font-medium text-primary hover:underline"
                >
                    {t("signIn")}
                </Link>
            </p>
        </div>
    );
}
