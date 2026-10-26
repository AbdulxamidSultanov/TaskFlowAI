import {redirect} from "next/navigation";

import {AppShell} from "@/components/layout/app-shell";
import {WorkspaceProvider} from "@/components/workspace/workspace-provider";
import {getAuthUser} from "@/lib/auth/session";

export default async function WorkspaceLayout({
    children,
    params,
}: LayoutProps<"/[locale]">) {
    const {locale} = await params;
    const user = await getAuthUser();

    if (!user) {
        redirect(`/${locale}/login`);
    }

    return (
        <WorkspaceProvider>
            <AppShell>{children}</AppShell>
        </WorkspaceProvider>
    );
}
