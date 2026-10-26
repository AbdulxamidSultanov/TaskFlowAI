import type {Metadata} from "next";

import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages} from "next-intl/server";
import {cookies} from "next/headers";

import Providers from "@/components/providers";
import {routing} from "@/i18n/routing";
import {isTheme, THEME_STORAGE_KEY} from "@/lib/theme";

import {Inter, Playfair_Display} from "next/font/google";
import "../globals.css";
import {notFound} from "next/navigation";

export function generateStaticParams() {
    return routing.locales.map((locale) => ({locale}));
}

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin", "cyrillic"],
    display: "swap",
});

const playFair = Playfair_Display({
    variable: "--font-playFair",
    subsets: ["latin", "cyrillic"],
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: "TaskFlowAI",
        template: "%s · TaskFlowAI",
    },
    description:
        "AI-powered workspace for tasks, projects, calendar, analytics, and team collaboration.",
    applicationName: "TaskFlowAI",
    icons: {
        icon: "/aiIcon.svg",
    },
};

export default async function LocaleLayout({children, params}: LayoutProps<"/[locale]">) {
    const {locale} = await params;

    if (!hasLocale(routing.locales, locale)) {
        notFound()
    }

    const messages = await getMessages();
    const cookieTheme = (await cookies()).get(THEME_STORAGE_KEY)?.value;
    const initialTheme = isTheme(cookieTheme) ? cookieTheme : undefined;
    const resolvedTheme =
        initialTheme === "light" || initialTheme === "dark"
            ? initialTheme
            : undefined;

    return (
        <html
            lang={locale}
            suppressHydrationWarning
            data-theme={resolvedTheme}
            style={{colorScheme: resolvedTheme ?? "light dark"}}
            className={`${inter.variable} ${playFair.variable} h-full antialiased`}
        >
        <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
            <Providers>
                {children}
            </Providers>
        </NextIntlClientProvider>
        </body>
        </html>
    );
}