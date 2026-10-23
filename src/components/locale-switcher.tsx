"use client";

import {useLocale} from "next-intl";
import {useTransition} from "react";

import {usePathname, useRouter} from "@/i18n/navigation";
import {routing} from "@/i18n/routing";

const languageNames = {
    ru: "Русский",
    uz: "O‘zbekcha",
    en: "English",
} as const;

type Locale = (typeof routing.locales)[number];

export function LocaleSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    const [isPending, startTransition] = useTransition();

    function handleChange(nextLocale: Locale) {
        startTransition(() => {
            router.replace(pathname, {
                locale: nextLocale,
            });
        });
    }

    return (
        <label className="inline-flex items-center gap-2">
            <span className="sr-only">Language</span>

            <select
                value={locale}
                disabled={isPending}
                onChange={(event) =>
                    handleChange(event.target.value as Locale)
                }
                className="
    rounded-lg border border-border
    bg-surface px-3 py-2
    text-text-primary
    "
            >
                {routing.locales.map((item) => (
                    <option key={item} value={item}>
                        {languageNames[item]}
                    </option>
                ))}
            </select>
        </label>
    );
}