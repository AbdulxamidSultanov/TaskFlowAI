"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    isTheme,
    THEME_COOKIE_MAX_AGE,
    THEME_STORAGE_KEY,
    type Theme,
    themeValues,
} from "@/lib/theme";

type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    systemTheme: ResolvedTheme;
    themes: Theme[];
    setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyTheme(theme: Theme, systemTheme: ResolvedTheme) {
    if (typeof document === "undefined") return;
    const resolved = theme === "system" ? systemTheme : theme;
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
}

function readStoredTheme(): Theme {
    if (typeof window === "undefined") return "system";
    try {
        const value = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (isTheme(value)) return value;
    } catch {
        // Storage can be unavailable in private mode. Try the cookie instead.
    }

    const match = document.cookie.match(
        new RegExp(`(?:^|;\\s*)${THEME_STORAGE_KEY}=([^;]*)`),
    );
    const cookieTheme = match?.[1];
    if (isTheme(cookieTheme)) return cookieTheme;

    return "system";
}

/**
 * Mirrors the choice into a cookie so the server can render the correct
 * palette on the next request without an inline script.
 */
function writeThemeCookie(theme: Theme) {
    if (typeof document === "undefined") return;
    document.cookie = `${THEME_STORAGE_KEY}=${theme};path=/;max-age=${THEME_COOKIE_MAX_AGE};samesite=lax`;
}

/**
 * Lightweight theme provider. Unlike inline script based providers, it does
 * not render a script element inside a client component, which keeps React
 * hydration clean. The initial palette is applied by the server from a cookie.
 */
export function ThemeProvider({children}: {children: ReactNode}) {
    const [theme, setThemeState] = useState<Theme>("system");
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
    const themeRef = useRef<Theme>("system");

    useEffect(() => {
        const stored = readStoredTheme();
        const currentSystemTheme = getSystemTheme();

        themeRef.current = stored;
        setThemeState(stored);
        setSystemTheme(currentSystemTheme);
        applyTheme(stored, currentSystemTheme);
        writeThemeCookie(stored);

        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            const next = getSystemTheme();
            setSystemTheme(next);
            if (themeRef.current === "system") {
                applyTheme("system", next);
            }
        };

        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    const setTheme = useCallback((next: Theme) => {
        const currentSystemTheme = getSystemTheme();
        themeRef.current = next;
        setThemeState(next);
        setSystemTheme(currentSystemTheme);
        applyTheme(next, currentSystemTheme);
        writeThemeCookie(next);
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // A failed write only means the choice is not persisted.
        }
    }, []);

    const resolvedTheme = theme === "system" ? systemTheme : theme;

    const value = useMemo<ThemeContextValue>(
        () => ({
            theme,
            resolvedTheme,
            systemTheme,
            themes: themeValues,
            setTheme,
        }),
        [theme, resolvedTheme, systemTheme, setTheme],
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider");
    }
    return context;
}
