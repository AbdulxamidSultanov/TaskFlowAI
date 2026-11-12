import { taskflowApi } from "./api";
import type { TimeReport, TimeReason } from "@/lib/time-types";
export const timeApi = taskflowApi.injectEndpoints({
    endpoints: (builder) => ({
        getTimeReport: builder.query<
            TimeReport,
            { workspaceId: string; from?: string; to?: string; userId?: string }
        >({
            query: (params) => ({ url: "/time-management", params }),
            transformResponse: (response: { data: TimeReport }) =>
                response.data,
            providesTags: ["Analytics"],
        }),
        logTime: builder.mutation<
            unknown,
            {
                taskId: string;
                startAt?: string;
                endAt?: string;
                difficulty: number;
                reason: TimeReason;
                note: string;
            }
        >({
            query: (body) => ({ url: "/time-entries", method: "POST", body }),
            invalidatesTags: ["Analytics", "Task"],
        }),
        stopTimer: builder.mutation<
            unknown,
            { id: string; difficulty: number; reason: TimeReason; note: string }
        >({
            query: ({ id, ...body }) => ({
                url: `/time-entries/${encodeURIComponent(id)}`,
                method: "PATCH",
                body,
            }),
            invalidatesTags: ["Analytics", "Task"],
        }),
        deleteTime: builder.mutation<void, string>({
            query: (id) => ({
                url: `/time-entries/${encodeURIComponent(id)}`,
                method: "DELETE",
            }),
            invalidatesTags: ["Analytics", "Task"],
        }),
    }),
});
export const {
    useGetTimeReportQuery,
    useLogTimeMutation,
    useStopTimerMutation,
    useDeleteTimeMutation,
} = timeApi;
