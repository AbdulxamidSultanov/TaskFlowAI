import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";

import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
    const requestedLocale =
        locale ?? (await rootParams.locale());

    // Проверяем, поддерживается ли язык
    if (!hasLocale(routing.locales, requestedLocale)) {
        notFound();
    }

    // Загружаем JSON нужного языка
    const messages = (
        await import(`../messages/${requestedLocale}.json`)
    ).default;

    return {
        locale: requestedLocale,
        messages,
    };
});