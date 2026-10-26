import {useTranslations} from "next-intl";
import {CalendarDays, ChartNoAxesColumn, Sparkles, Users} from "lucide-react";
import {redirect} from "next/navigation";
import type {ReactNode} from "react";

import {LocaleSwitcher} from "@/components/locale-switcher";
import {getAuthUser} from "@/lib/auth/session";

export default async function AuthLayout({
    children,
    params,
}: LayoutProps<"/[locale]">) {
    const {locale} = await params;
    const user = await getAuthUser();

    if (user) {
        redirect(`/${locale}/dashboard`);
    }

    return <AuthShell>{children}</AuthShell>;
}

function AuthShell({children}: {children: ReactNode}) {
    const t = useTranslations("auth");

    return (
        <div className="grid min-h-dvh bg-background lg:grid-cols-2">
            <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-10 text-white lg:flex">
                <div
                    aria-hidden
                    className="absolute -left-24 top-24 size-72 rounded-full bg-white/10 blur-2xl"
                />
                <div
                    aria-hidden
                    className="absolute -bottom-24 right-0 size-96 rounded-full bg-fuchsia-400/20 blur-3xl"
                />

                <div className="relative flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                        <Sparkles size={18} />
                    </span>
                    <span className="text-lg font-semibold tracking-tight">
                        TaskFlowAI
                    </span>
                </div>

                <div className="relative max-w-lg">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                        {t("brandEyebrow")}
                    </p>
                    <h1 className="text-4xl font-semibold leading-tight tracking-tight">
                        {t("brandTitle")}
                    </h1>
                    <p className="mt-4 text-sm leading-6 text-white/80">
                        {t("brandDescription")}
                    </p>

                    <div className="mt-8 grid gap-3">
                        {[
                            {
                                icon: <CalendarDays size={17} />,
                                title: t("featurePlanningTitle"),
                                description: t("featurePlanningDescription"),
                            },
                            {
                                icon: <ChartNoAxesColumn size={17} />,
                                title: t("featureAnalyticsTitle"),
                                description: t("featureAnalyticsDescription"),
                            },
                            {
                                icon: <Users size={17} />,
                                title: t("featureTeamTitle"),
                                description: t("featureTeamDescription"),
                            },
                        ].map((feature) => (
                            <div
                                key={feature.title}
                                className="flex gap-3 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur"
                            >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                                    {feature.icon}
                                </span>
                                <div>
                                    <p className="text-sm font-medium">
                                        {feature.title}
                                    </p>
                                    <p className="mt-0.5 text-xs text-white/70">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="relative text-xs text-white/50">
                    © {new Date().getFullYear()} TaskFlowAI
                </p>
            </div>

            <div className="relative flex min-h-dvh flex-col">
                <div className="flex items-center justify-between px-5 py-4 lg:px-8">
                    <div className="flex items-center gap-2 lg:invisible">
                        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-white">
                            <Sparkles size={15} />
                        </span>
                        <span className="text-base font-semibold tracking-tight text-text-primary">
                            TaskFlowAI
                        </span>
                    </div>
                    <LocaleSwitcher />
                </div>

                <div className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
                    <div className="w-full max-w-md">{children}</div>
                </div>
            </div>
        </div>
    );
}
