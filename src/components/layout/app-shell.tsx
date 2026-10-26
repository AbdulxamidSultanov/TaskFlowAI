"use client";

import {useState} from "react";

import {AppHeader} from "./app-header";
import {AppSidebar} from "./Sidebar/app-sidebar";

export function AppShell({children}: {children: React.ReactNode}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-dvh bg-background">
            <AppSidebar
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            <div className="min-w-0 md:pl-64">
                <AppHeader onMenuClick={() => setSidebarOpen(true)} />

                <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
