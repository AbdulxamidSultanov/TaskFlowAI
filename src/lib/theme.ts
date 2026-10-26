export const THEME_STORAGE_KEY = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark" | "system";

export const themeValues: Theme[] = ["light", "dark", "system"];

export function isTheme(value: string | null | undefined): value is Theme {
    return value === "light" || value === "dark" || value === "system";
}
