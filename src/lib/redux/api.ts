import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";

import {clearPersistedState} from "./persistence";
import type * as types from "./types";

function resolveApiBaseUrl() {
    const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (configured) return configured.replace(/\/$/, "");

    // In the browser the Next.js API is on the same origin. An absolute URL is
    // only needed if RTK Query is ever used while rendering on the server.
    if (typeof window !== "undefined") return "/api";
    return "http://localhost:3000/api";
}

function toQueryString(params?: object) {
    const entries = Object.entries(params ?? {}).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
    );

    if (entries.length === 0) return "";

    const search = new URLSearchParams();
    for (const [key, value] of entries) {
        search.set(key, String(value));
    }

    return `?${search.toString()}`;
}

function unwrap<T>(response: unknown) {
    return (response as types.ApiEnvelope<T>).data;
}

function entityPath(path: string, id: string) {
    return `${path}/${encodeURIComponent(id)}`;
}

export const taskflowApi = createApi({
    reducerPath: "taskflowApi",
    baseQuery: fetchBaseQuery({
        baseUrl: resolveApiBaseUrl(),
        credentials: "include",
        prepareHeaders: (headers) => {
            headers.set("accept", "application/json");
            return headers;
        },
    }),
    tagTypes: [
        "Me",
        "Department",
        "User",
        "Workspace",
        "WorkspaceMember",
        "Project",
        "Task",
        "Comment",
        "CalendarEvent",
        "Notification",
        "Tag",
        "Analytics",
        "AiConversation",
        "AiMessage",
        "AiPlan",
        "Settings",
    ],
    // Kept until the tab closes: RTK Query cache is also persisted in
    // sessionStorage by the store, so unused entries should not disappear early.
    keepUnusedDataFor: 60 * 60 * 24,
    refetchOnReconnect: true,
    refetchOnFocus: false,
    endpoints: (builder) => ({
        health: builder.query<types.Health, void>({
            query: () => "/health",
            transformResponse: (response) => unwrap<types.Health>(response),
        }),

        register: builder.mutation<types.AuthUser, types.RegisterInput>({
            query: (data) => ({
                url: "/auth/register",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.AuthUser>(response),
            invalidatesTags: ["Me"],
            async onQueryStarted(_arg, {dispatch, queryFulfilled}) {
                try {
                    await queryFulfilled;
                    dispatch({type: "taskflowApi/resetApiState"});
                    dispatch({type: "workspace/clearActiveWorkspace"});
                } catch {
                    // The form handles the error.
                }
            },
        }),
        login: builder.mutation<types.AuthUser, types.LoginInput>({
            query: (data) => ({
                url: "/auth/login",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.AuthUser>(response),
            invalidatesTags: ["Me"],
            async onQueryStarted(_arg, {dispatch, queryFulfilled}) {
                try {
                    await queryFulfilled;
                    // Never reuse the previous account's cached data.
                    dispatch({type: "taskflowApi/resetApiState"});
                    dispatch({type: "workspace/clearActiveWorkspace"});
                } catch {
                    // The form handles the error.
                }
            },
        }),
        logout: builder.mutation<{loggedOut: boolean}, void>({
            query: () => ({
                url: "/auth/logout",
                method: "POST",
            }),
            transformResponse: (response) =>
                unwrap<{loggedOut: boolean}>(response),
            async onQueryStarted(_arg, {dispatch, queryFulfilled}) {
                try {
                    await queryFulfilled;
                } finally {
                    dispatch({type: "taskflowApi/resetApiState"});
                    dispatch({type: "workspace/clearActiveWorkspace"});
                    clearPersistedState();
                }
            },
        }),
        getMe: builder.query<types.MeResponse, void>({
            query: () => "/auth/me",
            transformResponse: (response) =>
                unwrap<types.MeResponse>(response),
            providesTags: ["Me"],
        }),

        getDepartments: builder.query<types.DepartmentWithCounts[], void>({
            query: () => "/departments",
            transformResponse: (response) =>
                unwrap<types.DepartmentWithCounts[]>(response),
            providesTags: ["Department"],
        }),
        getDepartment: builder.query<types.DepartmentDetail, types.IdArg>({
            query: ({id}) => entityPath("/departments", id),
            transformResponse: (response) =>
                unwrap<types.DepartmentDetail>(response),
            providesTags: ["Department"],
        }),
        createDepartment: builder.mutation<
            types.Department,
            types.DepartmentCreateInput
        >({
            query: (data) => ({
                url: "/departments",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Department>(response),
            invalidatesTags: ["Department"],
        }),
        updateDepartment: builder.mutation<
            types.Department,
            {id: string; data: types.DepartmentUpdateInput}
        >({
            query: ({id, data}) => ({
                url: entityPath("/departments", id),
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Department>(response),
            invalidatesTags: ["Department"],
        }),
        deleteDepartment: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/departments", id),
                method: "DELETE",
            }),
            invalidatesTags: ["Department"],
        }),

        getUsers: builder.query<
            types.Paginated<types.User>,
            types.UserListArgs | void
        >({
            query: (args) => `/users${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.Paginated<types.User>>(response),
            providesTags: ["User"],
        }),
        getUser: builder.query<types.UserDetail, types.IdArg>({
            query: ({id}) => entityPath("/users", id),
            transformResponse: (response) =>
                unwrap<types.UserDetail>(response),
            providesTags: ["User"],
        }),
        createUser: builder.mutation<types.User, types.UserCreateInput>({
            query: (data) => ({
                url: "/users",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) => unwrap<types.User>(response),
            invalidatesTags: ["User"],
        }),
        updateUser: builder.mutation<
            types.User,
            {id: string; data: types.UserUpdateInput}
        >({
            query: ({id, data}) => ({
                url: entityPath("/users", id),
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) => unwrap<types.User>(response),
            invalidatesTags: ["User", "Me", "WorkspaceMember"],
        }),
        deleteUser: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/users", id),
                method: "DELETE",
            }),
            invalidatesTags: ["User"],
        }),

        getWorkspaces: builder.query<types.WorkspaceListItem[], void>({
            query: () => "/workspaces",
            transformResponse: (response) =>
                unwrap<types.WorkspaceListItem[]>(response),
            providesTags: ["Workspace"],
        }),
        getWorkspace: builder.query<types.WorkspaceDetail, types.IdArg>({
            query: ({id}) => entityPath("/workspaces", id),
            transformResponse: (response) =>
                unwrap<types.WorkspaceDetail>(response),
            providesTags: ["Workspace", "WorkspaceMember"],
        }),
        createWorkspace: builder.mutation<
            types.Workspace,
            types.WorkspaceCreateInput
        >({
            query: (data) => ({
                url: "/workspaces",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Workspace>(response),
            invalidatesTags: ["Workspace"],
        }),
        updateWorkspace: builder.mutation<
            types.Workspace,
            {id: string; data: types.WorkspaceUpdateInput}
        >({
            query: ({id, data}) => ({
                url: entityPath("/workspaces", id),
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Workspace>(response),
            invalidatesTags: ["Workspace"],
        }),
        deleteWorkspace: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/workspaces", id),
                method: "DELETE",
            }),
            invalidatesTags: ["Workspace"],
        }),
        getWorkspaceMembers: builder.query<
            types.WorkspaceMember[],
            {workspaceId: string}
        >({
            query: ({workspaceId}) =>
                `${entityPath("/workspaces", workspaceId)}/members`,
            transformResponse: (response) =>
                unwrap<types.WorkspaceMember[]>(response),
            providesTags: ["WorkspaceMember"],
        }),
        addWorkspaceMember: builder.mutation<
            types.WorkspaceMembership,
            {workspaceId: string; data: types.WorkspaceMemberAddInput}
        >({
            query: ({workspaceId, data}) => ({
                url: `${entityPath("/workspaces", workspaceId)}/members`,
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.WorkspaceMembership>(response),
            invalidatesTags: ["WorkspaceMember", "Workspace", "User"],
        }),
        updateWorkspaceMember: builder.mutation<
            types.WorkspaceMembership,
            {workspaceId: string; userId: string; role: types.WorkspaceMembership["role"]}
        >({
            query: ({workspaceId, userId, role}) => ({
                url: `${entityPath("/workspaces", workspaceId)}/members${toQueryString({userId})}`,
                method: "PATCH",
                body: {role},
            }),
            transformResponse: (response) =>
                unwrap<types.WorkspaceMembership>(response),
            invalidatesTags: ["WorkspaceMember", "Workspace"],
        }),
        removeWorkspaceMember: builder.mutation<
            void,
            {workspaceId: string; userId: string}
        >({
            query: ({workspaceId, userId}) => ({
                url: `${entityPath("/workspaces", workspaceId)}/members${toQueryString({userId})}`,
                method: "DELETE",
            }),
            invalidatesTags: ["WorkspaceMember", "Workspace", "User"],
        }),

        getProjects: builder.query<
            types.Paginated<types.Project>,
            types.ProjectListArgs | void
        >({
            query: (args) => `/projects${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.Paginated<types.Project>>(response),
            providesTags: ["Project"],
        }),
        getProject: builder.query<types.ProjectDetail, types.IdArg>({
            query: ({id}) => entityPath("/projects", id),
            transformResponse: (response) =>
                unwrap<types.ProjectDetail>(response),
            providesTags: ["Project", "Task"],
        }),
        createProject: builder.mutation<
            types.ProjectRecord,
            types.ProjectCreateInput
        >({
            query: (data) => ({
                url: "/projects",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.ProjectRecord>(response),
            invalidatesTags: ["Project", "Analytics"],
        }),
        updateProject: builder.mutation<
            types.Project,
            {id: string; data: types.ProjectUpdateInput}
        >({
            query: ({id, data}) => ({
                url: entityPath("/projects", id),
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Project>(response),
            invalidatesTags: ["Project", "Task", "Analytics"],
        }),
        deleteProject: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/projects", id),
                method: "DELETE",
            }),
            invalidatesTags: ["Project", "Task", "Analytics"],
        }),

        getTasks: builder.query<
            types.Paginated<types.TaskListItem>,
            types.TaskListArgs | void
        >({
            query: (args) => `/tasks${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.Paginated<types.TaskListItem>>(response),
            providesTags: ["Task"],
        }),
        getTask: builder.query<types.TaskDetail, types.IdArg>({
            query: ({id}) => entityPath("/tasks", id),
            transformResponse: (response) =>
                unwrap<types.TaskDetail>(response),
            providesTags: ["Task", "Comment"],
        }),
        createTask: builder.mutation<types.TaskDetail, types.TaskCreateInput>({
            query: (data) => ({
                url: "/tasks",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.TaskDetail>(response),
            invalidatesTags: [
                "Task",
                "Project",
                "Analytics",
                "Notification",
            ],
        }),
        updateTask: builder.mutation<
            types.TaskDetail,
            {id: string; data: types.TaskUpdateInput}
        >({
            query: ({id, data}) => ({
                url: entityPath("/tasks", id),
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.TaskDetail>(response),
            invalidatesTags: [
                "Task",
                "Project",
                "Analytics",
                "Notification",
            ],
        }),
        deleteTask: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/tasks", id),
                method: "DELETE",
            }),
            invalidatesTags: [
                "Task",
                "Project",
                "Analytics",
            ],
        }),
        getTaskComments: builder.query<
            types.TaskComment[],
            {taskId: string}
        >({
            query: ({taskId}) =>
                `${entityPath("/tasks", taskId)}/comments`,
            transformResponse: (response) =>
                unwrap<types.TaskComment[]>(response),
            providesTags: ["Comment"],
        }),
        addTaskComment: builder.mutation<
            types.Comment,
            {taskId: string; data: types.CommentCreateInput}
        >({
            query: ({taskId, data}) => ({
                url: `${entityPath("/tasks", taskId)}/comments`,
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Comment>(response),
            invalidatesTags: ["Comment", "Task"],
        }),

        getCalendarEvents: builder.query<
            types.CalendarEvent[],
            types.CalendarListArgs | void
        >({
            query: (args) =>
                `/calendar/events${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.CalendarEvent[]>(response),
            providesTags: ["CalendarEvent"],
        }),
        getCalendarEvent: builder.query<types.CalendarEvent, types.IdArg>({
            query: ({id}) => entityPath("/calendar/events", id),
            transformResponse: (response) =>
                unwrap<types.CalendarEvent>(response),
            providesTags: ["CalendarEvent"],
        }),
        createCalendarEvent: builder.mutation<
            types.CalendarEvent,
            types.CalendarEventCreateInput
        >({
            query: (data) => ({
                url: "/calendar/events",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.CalendarEvent>(response),
            invalidatesTags: ["CalendarEvent", "Task", "Analytics"],
        }),
        updateCalendarEvent: builder.mutation<
            types.CalendarEvent,
            {id: string; data: types.CalendarEventUpdateInput}
        >({
            query: ({id, data}) => ({
                url: entityPath("/calendar/events", id),
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.CalendarEvent>(response),
            invalidatesTags: ["CalendarEvent", "Task", "Analytics"],
        }),
        deleteCalendarEvent: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/calendar/events", id),
                method: "DELETE",
            }),
            invalidatesTags: ["CalendarEvent", "Task", "Analytics"],
        }),

        getNotifications: builder.query<
            types.NotificationListResponse,
            types.NotificationListArgs | void
        >({
            query: (args) => {
                // `unread=false` is not a useful filter: omit it to get all
                // notifications (the backend treats any presence as true).
                const params = args
                    ? {...args, unread: args.unread ? true : undefined}
                    : undefined;
                return `/notifications${toQueryString(params)}`;
            },
            transformResponse: (response) =>
                unwrap<types.NotificationListResponse>(response),
            providesTags: ["Notification"],
        }),
        createNotification: builder.mutation<
            types.Notification,
            types.NotificationCreateInput
        >({
            query: (data) => ({
                url: "/notifications",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.Notification>(response),
            invalidatesTags: ["Notification"],
        }),
        markNotificationRead: builder.mutation<
            types.Notification,
            types.IdArg
        >({
            query: ({id}) => ({
                url: entityPath("/notifications", id),
                method: "PATCH",
            }),
            transformResponse: (response) =>
                unwrap<types.Notification>(response),
            invalidatesTags: ["Notification"],
        }),
        deleteNotification: builder.mutation<void, types.IdArg>({
            query: ({id}) => ({
                url: entityPath("/notifications", id),
                method: "DELETE",
            }),
            invalidatesTags: ["Notification"],
        }),
        markAllNotificationsRead: builder.mutation<
            {readAt: string},
            void
        >({
            query: () => ({
                url: "/notifications/read-all",
                method: "POST",
            }),
            transformResponse: (response) =>
                unwrap<{readAt: string}>(response),
            invalidatesTags: ["Notification"],
        }),

        getTags: builder.query<types.Tag[], {workspaceId: string}>({
            query: ({workspaceId}) =>
                `/tags${toQueryString({workspaceId})}`,
            transformResponse: (response) => unwrap<types.Tag[]>(response),
            providesTags: ["Tag"],
        }),
        createTag: builder.mutation<types.Tag, types.TagCreateInput>({
            query: (data) => ({
                url: "/tags",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) => unwrap<types.Tag>(response),
            invalidatesTags: ["Tag"],
        }),

        getAnalyticsOverview: builder.query<
            types.AnalyticsOverview,
            types.AnalyticsArgs | void
        >({
            query: (args) =>
                `/analytics/overview${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.AnalyticsOverview>(response),
            providesTags: ["Analytics"],
        }),

        getAiConversations: builder.query<
            types.AiConversation[],
            {workspaceId?: string} | void
        >({
            query: (args) =>
                `/ai/conversations${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.AiConversation[]>(response),
            providesTags: ["AiConversation"],
        }),
        createAiConversation: builder.mutation<
            types.AiConversation,
            types.AiConversationCreateInput
        >({
            query: (data) => ({
                url: "/ai/conversations",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.AiConversation>(response),
            invalidatesTags: ["AiConversation"],
        }),
        getAiMessages: builder.query<
            types.AiMessage[],
            {conversationId: string}
        >({
            query: ({conversationId}) =>
                `${entityPath("/ai/conversations", conversationId)}/messages`,
            transformResponse: (response) =>
                unwrap<types.AiMessage[]>(response),
            providesTags: ["AiMessage"],
        }),
        sendAiMessage: builder.mutation<
            {userMessage: types.AiMessage; assistantMessage: types.AiMessage},
            {conversationId: string; data: types.AiMessageCreateInput}
        >({
            query: ({conversationId, data}) => ({
                url: `${entityPath("/ai/conversations", conversationId)}/messages`,
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<{
                    userMessage: types.AiMessage;
                    assistantMessage: types.AiMessage;
                }>(response),
            invalidatesTags: ["AiMessage", "AiConversation"],
        }),
        getAiPlans: builder.query<
            types.AiPlan[],
            {workspaceId?: string} | void
        >({
            query: (args) => `/ai/plan${toQueryString(args ?? undefined)}`,
            transformResponse: (response) =>
                unwrap<types.AiPlan[]>(response),
            providesTags: ["AiPlan"],
        }),
        createAiPlan: builder.mutation<types.AiPlan, types.AiPlanRequest>({
            query: (data) => ({
                url: "/ai/plan",
                method: "POST",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.AiPlan>(response),
            invalidatesTags: ["AiPlan", "Task", "Analytics"],
        }),

        getSettings: builder.query<types.UserSettings, void>({
            query: () => "/settings",
            transformResponse: (response) =>
                unwrap<types.UserSettings>(response),
            providesTags: ["Settings"],
        }),
        updateSettings: builder.mutation<
            types.UserSettings,
            types.SettingsUpdateInput
        >({
            query: (data) => ({
                url: "/settings",
                method: "PATCH",
                body: data,
            }),
            transformResponse: (response) =>
                unwrap<types.UserSettings>(response),
            invalidatesTags: ["Settings", "Me"],
        }),
    }),
});

export const {
    useHealthQuery,
    useRegisterMutation,
    useLoginMutation,
    useLogoutMutation,
    useGetMeQuery,
    useGetDepartmentsQuery,
    useGetDepartmentQuery,
    useCreateDepartmentMutation,
    useUpdateDepartmentMutation,
    useDeleteDepartmentMutation,
    useGetUsersQuery,
    useGetUserQuery,
    useCreateUserMutation,
    useUpdateUserMutation,
    useDeleteUserMutation,
    useGetWorkspacesQuery,
    useGetWorkspaceQuery,
    useCreateWorkspaceMutation,
    useUpdateWorkspaceMutation,
    useDeleteWorkspaceMutation,
    useGetWorkspaceMembersQuery,
    useAddWorkspaceMemberMutation,
    useUpdateWorkspaceMemberMutation,
    useRemoveWorkspaceMemberMutation,
    useGetProjectsQuery,
    useGetProjectQuery,
    useCreateProjectMutation,
    useUpdateProjectMutation,
    useDeleteProjectMutation,
    useGetTasksQuery,
    useGetTaskQuery,
    useCreateTaskMutation,
    useUpdateTaskMutation,
    useDeleteTaskMutation,
    useGetTaskCommentsQuery,
    useAddTaskCommentMutation,
    useGetCalendarEventsQuery,
    useGetCalendarEventQuery,
    useCreateCalendarEventMutation,
    useUpdateCalendarEventMutation,
    useDeleteCalendarEventMutation,
    useGetNotificationsQuery,
    useCreateNotificationMutation,
    useMarkNotificationReadMutation,
    useDeleteNotificationMutation,
    useMarkAllNotificationsReadMutation,
    useGetTagsQuery,
    useCreateTagMutation,
    useGetAnalyticsOverviewQuery,
    useGetAiConversationsQuery,
    useCreateAiConversationMutation,
    useGetAiMessagesQuery,
    useSendAiMessageMutation,
    useGetAiPlansQuery,
    useCreateAiPlanMutation,
    useGetSettingsQuery,
    useUpdateSettingsMutation,
} = taskflowApi;
