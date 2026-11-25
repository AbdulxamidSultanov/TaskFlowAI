"use client";

import {ExternalLink} from "lucide-react";
import {useTranslations} from "next-intl";
import {useId, useState} from "react";

import {AiAssistant} from "@/components/ai/ai-assistant";
import {AiTaskGenerator} from "@/components/ai/ai-task-generator";
import {Select} from "@/components/ui/input";
import {PageHeader} from "@/components/ui/layout";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {Link} from "@/i18n/navigation";

type AiAgent = "assistant" | "taskExecutor";

export function AiAgentWorkspace({defaultAgent}: {defaultAgent: AiAgent}) {
    const {workspace} = useWorkspace();
    const t = useTranslations("aiAgents");
    const tGenerator = useTranslations("aiGenerator");
    const selectId = useId();
    const [agent, setAgent] = useState(defaultAgent);

    const agentPicker = (
        <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-xs font-medium text-text-secondary">
                {t("label")}
            </label>
            <Select
                id={selectId}
                value={agent}
                onChange={(event) => setAgent(event.target.value === "assistant" ? "assistant" : "taskExecutor")}
                className="w-auto"
            >
                <option value="assistant">{t("assistant")}</option>
                <option value="taskExecutor">{t("taskExecutor")}</option>
            </Select>
            <Link
                href={agent === "assistant" ? "/ai-assistant" : "/ai-workspace"}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("openInNewTab")}
                title={t("openInNewTab")}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
                <ExternalLink size={16} aria-hidden="true" />
            </Link>
        </div>
    );

    return agent === "assistant" ? (
        <AiAssistant key={workspace.id} agentPicker={agentPicker} />
    ) : (
        <div className="space-y-5">
            <PageHeader
                eyebrow={tGenerator("pageEyebrow")}
                title={tGenerator("pageTitle")}
                description={tGenerator("pageDescription")}
                actions={agentPicker}
            />
            <AiTaskGenerator key={workspace.id} />
        </div>
    );
}
