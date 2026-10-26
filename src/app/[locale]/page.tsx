import {redirect} from "next/navigation";

import {getAuthUser} from "@/lib/auth/session";

export default async function LocaleIndexPage({
    params,
}: {
    params: Promise<{locale: string}>;
}) {
    const {locale} = await params;
    const user = await getAuthUser();

    redirect(`/${locale}/${user ? "dashboard" : "login"}`);
}
