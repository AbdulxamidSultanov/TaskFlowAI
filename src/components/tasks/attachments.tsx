"use client";
import { upload as uploadBlob } from "@vercel/blob/client";
import type { TaskPermissions } from "@/lib/auth/task-rights";
import { useTranslations } from "next-intl";
import { taskflowApi } from "@/lib/redux/api";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
const api = taskflowApi.injectEndpoints({
    endpoints: (b) => ({
        attachments: b.query<
            {
                id: string;
                name: string;
                size: number;
                uploadedById: string | null;
            }[],
            string
        >({
            query: (id) => `/tasks/${encodeURIComponent(id)}/attachments`,
            transformResponse: (r: {
                data: {
                    id: string;
                    name: string;
                    size: number;
                    uploadedById: string | null;
                }[];
            }) => r.data,
            providesTags: ["Task"],
        }),
        upload: b.mutation<unknown, { id: string; file: File }>({
            async queryFn({ id, file }, _api, _options, baseQuery) {
                const url = `/tasks/${encodeURIComponent(id)}/attachments`;
                const prepared = await baseQuery({
                    url: `${url}/upload`, method: "POST",
                    body: { action: "prepare", name: file.name, size: file.size },
                });
                if (prepared.error) return { error: prepared.error };
                const { data } = prepared.data as {
                    data: { mode: "local" | "blob"; pathname?: string; token?: string };
                };
                if (data.mode === "local") {
                    const body = new FormData();
                    body.set("file", file);
                    return baseQuery({ url, method: "POST", body });
                }
                try {
                    await uploadBlob(data.pathname!, file, {
                        access: "private",
                        handleUploadUrl: `/api${url}/upload`,
                        clientPayload: data.token,
                        multipart: true,
                    });
                    return baseQuery({
                        url: `${url}/upload`, method: "POST",
                        body: { action: "complete", token: data.token },
                    });
                } catch (error) {
                    return { error: { status: "CUSTOM_ERROR", error: error instanceof Error ? error.message : "Upload failed" } };
                }
            },
            invalidatesTags: ["Task", "Workspace"],
        }),
        removeAttachment: b.mutation<void, string>({
            query: (id) => ({
                url: `/attachments/${encodeURIComponent(id)}`,
                method: "DELETE",
            }),
            invalidatesTags: ["Task", "Workspace"],
        }),
    }),
});
export function Attachments({
    taskId,
    permissions,
}: {
    taskId: string;
    permissions?: TaskPermissions;
}) {
    const t = useTranslations("attachments");
    const { user } = useWorkspace();
    const canEdit = permissions?.upload ?? false;
    const toast = useToast();
    const { data } = api.useAttachmentsQuery(taskId);
    const [upload, state] = api.useUploadMutation();
    const [remove, removeState] = api.useRemoveAttachmentMutation();
    const fail = (e: unknown) => toast.error(getApiErrorMessage(e, t("error")));
    return (
        <section className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t("title")}</h3>
            <ul className="my-3 space-y-2 text-sm">
                {data?.map((file) => (
                    <li
                        key={file.id}
                        className="flex items-center justify-between gap-3"
                    >
                        <a
                            className="truncate text-primary underline"
                            href={`/api/attachments/${encodeURIComponent(file.id)}`}
                        >
                            {file.name} · {Math.ceil(file.size / 1024)} KB
                        </a>
                        {canEdit &&
                        (permissions?.delete ||
                            file.uploadedById === user.id) ? (
                            <button
                                disabled={removeState.isLoading}
                                className="text-xs text-error"
                                onClick={() => {
                                    if (window.confirm(t("confirm")))
                                        void remove(file.id)
                                            .unwrap()
                                            .catch(fail);
                                }}
                            >
                                {t("remove")}
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
            {canEdit ? (
                <label className="block text-xs text-text-secondary">
                    {t("limit")}
                    <input
                        aria-label={t("upload")}
                        className="mt-2 block w-full text-sm"
                        disabled={state.isLoading}
                        type="file"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                                void upload({ id: taskId, file })
                                    .unwrap()
                                    .catch(fail);
                            e.target.value = "";
                        }}
                    />
                </label>
            ) : null}
        </section>
    );
}
