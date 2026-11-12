import { taskflowApi } from "./api";
import type {
    DayBoard,
    Participant,
    WorkflowCommand,
} from "@/lib/task-workflow-types";
export const workflowApi = taskflowApi.injectEndpoints({
    endpoints: (b) => ({
        dayBoard: b.query<
            DayBoard,
            {
                workspaceId: string;
                supervisor?: boolean;
                assigneeId?: string;
                status?: string;
                from?: string;
                to?: string;
                fromDay?: string;
                toDay?: string;
            }
        >({
            query: ({ supervisor, ...params }) => ({
                url: supervisor ? "/team-control" : "/my-day",
                params,
            }),
            transformResponse: (r: { data: DayBoard }) => r.data,
            providesTags: ["Task", "WorkspaceMember"],
        }),
        taskWorkflow: b.mutation<
            unknown,
            { id: string; data: WorkflowCommand }
        >({
            query: ({ id, data }) => ({
                url: `/tasks/${encodeURIComponent(id)}/workflow`,
                method: "POST",
                body: data,
            }),
            invalidatesTags: ["Task", "Analytics", "Notification", "Workspace"],
        }),
        taskParticipants: b.query<Participant[], string>({
            query: (id) => `/tasks/${encodeURIComponent(id)}/participants`,
            transformResponse: (r: { data: Participant[] }) => r.data,
            providesTags: ["Task"],
        }),
        taskCandidates: b.query<
            { id: string; name: string; department: string | null }[],
            string
        >({
            query: (id) => `/tasks/${encodeURIComponent(id)}/candidates`,
            transformResponse: (r: {
                data: { id: string; name: string; department: string | null }[];
            }) => r.data,
            providesTags: ["Task", "WorkspaceMember"],
        }),
        changeParticipant: b.mutation<
            unknown,
            { id: string; userId: string; role?: Participant["role"] }
        >({
            query: ({ id, userId, role }) => ({
                url: `/tasks/${encodeURIComponent(id)}/participants${role ? "" : `?userId=${encodeURIComponent(userId)}`}`,
                method: role ? "POST" : "DELETE",
                ...(role ? { body: { userId, role } } : {}),
            }),
            invalidatesTags: [
                "Task",
                "Analytics",
                "Notification",
                "Project",
                "Workspace",
            ],
        }),
    }),
});
export const {
    useDayBoardQuery,
    useTaskWorkflowMutation,
    useTaskParticipantsQuery,
    useTaskCandidatesQuery,
    useChangeParticipantMutation,
} = workflowApi;
