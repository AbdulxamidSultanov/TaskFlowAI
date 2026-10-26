"use client"

import type {ReactNode} from "react";
import {useEffect, useState} from "react";
import {Provider} from "react-redux";

import {ThemeProvider} from "@/components/theme-provider";
import {ToastProvider} from "@/components/ui/toast";
import {hydrateStore, makeStore, type AppStore} from "@/lib/redux/store";

interface ProvidersProps {
    children: ReactNode;
}

const Providers = ({children}: ProvidersProps) => {
    const [store] = useState<AppStore>(() => makeStore());

    // Rehydrate the Redux/RTK Query cache only after the initial client render
    // committed. Server HTML is produced with an empty cache, so preloading the
    // store during render caused hydration mismatches (for example when the
    // workspace layout switched from the loader to the full shell).
    useEffect(() => {
        hydrateStore(store);
    }, [store]);

    return (
        <Provider store={store}>
            <ThemeProvider>
                <ToastProvider>{children}</ToastProvider>
            </ThemeProvider>
        </Provider>
    );
};

export default Providers;
