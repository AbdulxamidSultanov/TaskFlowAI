"use client"

import {ThemeProvider as NextThemesProvider} from "next-themes";
import type {ReactNode} from "react";

interface ProvidersProps {
    children: ReactNode;
}

const Providers = ({children}: ProvidersProps) => {
    return (
        <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem={true}>
            {children}
        </NextThemesProvider>

    );
};

export default Providers;