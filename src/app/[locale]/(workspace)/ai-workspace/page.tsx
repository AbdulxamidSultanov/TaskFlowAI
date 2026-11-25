"use client";

import { useTranslations } from "next-intl";

import { AiTaskGenerator } from "@/components/ai/ai-task-generator";
import { PageHeader } from "@/components/ui/layout";

export default function AiWorkspacePage() {
    const t = useTranslations("aiGenerator");

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("pageEyebrow")}
                title={t("pageTitle")}
                description={t("pageDescription")}
            />
            <AiTaskGenerator />
        </div>
    );
}
