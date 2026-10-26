import { defineRouting } from "next-intl/routing";

export const languageNames = {
    ru: "Русский",
    uz: "O‘zbekcha",
    en: "English",
} as const;

export const routing = defineRouting({
    locales: ["ru", "uz", "en"],

    // Язык по умолчанию
    defaultLocale: "ru",

    // URL всегда содержит префикс языка
    localePrefix: "always",
});
