import type {
    LocaleValue,
    NotificationType,
    ProjectStatus,
    TaskPriority,
    TaskStatus,
    ThemeValue,
    UserRole,
    WorkspacePlan,
    WorkspaceRole,
} from "@/lib/domain";

/** JSON dates returned by the API are ISO strings on the client. */
export type IsoDateString = string;

export type ApiEnvelope<T> = {
    data: T;
};

export type PaginationMeta = {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
};

export type Paginated<T> = {
    items: T[];
    pagination: PaginationMeta;
};

export type PageArgs = {
    page?: number;
    pageSize?: number;
};

export type IdArg = {
    id: string;
};

export type DepartmentRef = {
    id: string;
    name: string;
    slug: string;
    color: string;
};

export type UserRef = {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
};

export type ProjectRef = {
    id: string;
    name: string;
    key: string;
    color?: string;
};

export type TaskRef = {
    id: string;
    title: string;
    status: TaskStatus;
};

export type Department = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    color: string;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
};

export type DepartmentWithCounts = Department & {
    counts: {
        users: number;
        projects: number;
        tasks: number;
    };
};

export type DepartmentMember = Pick<
    User,
    | "id"
    | "name"
    | "email"
    | "role"
    | "jobTitle"
    | "avatarUrl"
    | "isActive"
>;

export type DepartmentDetail = DepartmentWithCounts & {
    members: DepartmentMember[];
};

export type User = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    departmentId: string | null;
    jobTitle: string | null;
    avatarUrl: string | null;
    timezone: string;
    isActive: boolean;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
    department: DepartmentRef | null;
};

export type UserSettings = {
    userId: string;
    theme: ThemeValue;
    locale: LocaleValue;
    dailySummaryEmail: boolean;
    overduePush: boolean;
    teamMentions: boolean;
    aiModel: string;
    updatedAt: IsoDateString;
};

export type Membership = {
    role: WorkspaceRole;
    joinedAt: IsoDateString;
    workspace: {
        id: string;
        name: string;
        slug: string;
        plan: WorkspacePlan;
    };
};

export type AuthUser = Omit<User, "department"> & {
    department: DepartmentRef | null;
};

export type MeResponse = {
    user: AuthUser;
    settings: UserSettings;
    memberships: Membership[];
};

export type UserDetail = User & {
    stats: {
        assignedTasks: number;
        createdTasks: number;
    };
    memberships: Membership[];
    settings: UserSettings | null;
};

export type Workspace = {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    plan: WorkspacePlan;
    storageUsedBytes: number;
    storageLimitBytes: number;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
};

export type WorkspaceListItem = Workspace & {
    role: WorkspaceRole | null;
    memberCount: number;
    projectCount: number;
    taskCount: number;
};

export type WorkspaceMember = {
    id: string;
    role: WorkspaceRole;
    joinedAt: IsoDateString;
    user: {
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
        jobTitle: string | null;
        departmentId?: string | null;
    };
};

export type WorkspaceMembership = {
    id: string;
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
    joinedAt: IsoDateString;
};

export type ProjectRecord = {
    id: string;
    workspaceId: string;
    departmentId: string;
    name: string;
    key: string;
    description: string | null;
    color: string;
    status: ProjectStatus;
    ownerId: string;
    startDate: IsoDateString | null;
    dueDate: IsoDateString | null;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
};

export type WorkspaceDetail = Workspace & {
    role: WorkspaceRole;
    members: WorkspaceMember[];
    projects: ProjectRecord[];
    counts: {
        members: number;
        projects: number;
        tasks: number;
    };
};

export type Project = {
    id: string;
    workspaceId: string;
    departmentId: string;
    name: string;
    key: string;
    description: string | null;
    color: string;
    status: ProjectStatus;
    ownerId: string;
    startDate: IsoDateString | null;
    dueDate: IsoDateString | null;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
    department: DepartmentRef;
    owner: UserRef | null;
    taskCount: number;
};

export type ProjectTaskSummary = {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId: string | null;
    dueDate: IsoDateString | null;
};

export type ProjectDetail = Project & {
    tasks: ProjectTaskSummary[];
};

export type Tag = {
    id: string;
    workspaceId: string;
    name: string;
    color: string;
    createdAt: IsoDateString;
};

export type Task = {
    id: string;
    workspaceId: string;
    projectId: string;
    departmentId: string;
    parentTaskId: string | null;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId: string | null;
    creatorId: string;
    startDate: IsoDateString | null;
    dueDate: IsoDateString | null;
    estimateMinutes: number | null;
    position: number;
    completedAt: IsoDateString | null;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
};

export type TaskTag = Pick<Tag, "id" | "name" | "color">;

export type TaskListItem = Task & {
    tags: TaskTag[];
};

export type TaskComment = {
    id: string;
    body: string;
    createdAt: IsoDateString;
    author: {
        id: string;
        name: string;
        avatarUrl: string | null;
    };
};

export type TaskDetail = Task & {
    project: ProjectRef;
    department: DepartmentRef;
    assignee: UserRef | null;
    creator: UserRef;
    commentCount: number;
    subtaskCount: number;
    tags: TaskTag[];
    comments: TaskComment[];
};

export type Comment = {
    id: string;
    taskId: string;
    authorId: string;
    body: string;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
};

export type CalendarEvent = {
    id: string;
    workspaceId: string;
    departmentId: string | null;
    projectId: string | null;
    taskId: string | null;
    title: string;
    description: string | null;
    startAt: IsoDateString;
    endAt: IsoDateString;
    allDay: boolean;
    location: string | null;
    createdById: string;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
    department?: DepartmentRef | null;
    project?: ProjectRef | null;
    task?: TaskRef | null;
};

export type Notification = {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string | null;
    entityType: string | null;
    entityId: string | null;
    readAt: IsoDateString | null;
    createdAt: IsoDateString;
};

export type NotificationListResponse = Paginated<Notification> & {
    unread: number;
};

export type AnalyticsOverview = {
    totals: {
        tasks: number;
        completed: number;
        open: number;
        overdue: number;
        completionRate: number;
    };
    byStatus: Array<{status: TaskStatus; count: number}>;
    byPriority: Array<{priority: TaskPriority; count: number}>;
    byDepartment: Array<{
        departmentId: string;
        name: string;
        color: string;
        total: number;
        completed: number;
    }>;
    upcoming: Array<{
        id: string;
        title: string;
        status: TaskStatus;
        priority: TaskPriority;
        dueDate: IsoDateString | null;
        assigneeId: string | null;
        projectId: string;
    }>;
    recentlyCompleted: Array<{
        id: string;
        title: string;
        completedAt: IsoDateString | null;
        assigneeId: string | null;
    }>;
};

export type AiConversation = {
    id: string;
    workspaceId: string;
    userId: string;
    title: string;
    model: string;
    createdAt: IsoDateString;
    updatedAt: IsoDateString;
};

export type AiMessage = {
    id: string;
    conversationId: string;
    role: "system" | "user" | "assistant";
    content: string;
    createdAt: IsoDateString;
};

export type AiPlanItem = {
    id: string;
    taskId: string | null;
    startAt: IsoDateString;
    endAt: IsoDateString;
    position: number;
    reason: string | null;
    task: {
        id: string;
        title: string;
        status: TaskStatus;
        priority: TaskPriority;
        dueDate: IsoDateString | null;
    } | null;
    project: ProjectRef | null;
};

export type AiPlan = {
    id: string;
    workspaceId: string;
    userId: string;
    date: IsoDateString;
    summary: string;
    rationale: string;
    availableMinutes: number;
    createdAt: IsoDateString;
    items: AiPlanItem[];
};

export type Health = {
    status: string;
    database: string;
    latencyMs: number;
    timestamp: string;
};

export type RegisterInput = {
    name: string;
    email: string;
    password: string;
    departmentId?: string | null;
};

export type LoginInput = {
    email: string;
    password: string;
};

export type DepartmentCreateInput = {
    name: string;
    slug: string;
    description?: string | null;
    color?: string;
};

export type DepartmentUpdateInput = Partial<DepartmentCreateInput>;

export type UserCreateInput = {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
    departmentId?: string | null;
    jobTitle?: string | null;
    avatarUrl?: string | null;
    timezone?: string;
};

export type UserUpdateInput = Partial<Omit<UserCreateInput, "password">> & {
    password?: string;
    isActive?: boolean;
};

export type UserListArgs = PageArgs & {
    departmentId?: string;
    role?: UserRole;
    search?: string;
};

export type WorkspaceCreateInput = {
    name: string;
    slug: string;
    plan?: WorkspacePlan;
};

export type WorkspaceUpdateInput = {
    name?: string;
    plan?: WorkspacePlan;
    storageUsedBytes?: number;
    storageLimitBytes?: number;
};

export type WorkspaceMemberAddInput = {
    userId: string;
    role?: WorkspaceRole;
};

export type ProjectCreateInput = {
    workspaceId: string;
    departmentId: string;
    name: string;
    key: string;
    description?: string | null;
    color?: string;
    status?: ProjectStatus;
    ownerId?: string;
    startDate?: string | null;
    dueDate?: string | null;
};

export type ProjectUpdateInput = Partial<Omit<ProjectCreateInput, "workspaceId">>;

export type ProjectListArgs = PageArgs & {
    workspaceId?: string;
    departmentId?: string;
    status?: ProjectStatus;
    search?: string;
};

export type TaskCreateInput = {
    workspaceId?: string;
    projectId: string;
    departmentId?: string;
    parentTaskId?: string | null;
    title: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    estimateMinutes?: number | null;
    position?: number;
    tagIds?: string[];
};

export type TaskUpdateInput = Partial<Omit<TaskCreateInput, "workspaceId">>;

export type TaskListArgs = PageArgs & {
    workspaceId?: string;
    projectId?: string;
    departmentId?: string;
    assigneeId?: string;
    parentTaskId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    search?: string;
    due?: "overdue" | "today" | "week";
    dueFrom?: string;
    dueTo?: string;
};

export type CommentCreateInput = {
    body: string;
};

export type CalendarListArgs = {
    workspaceId?: string;
    departmentId?: string;
    projectId?: string;
    from?: string;
    to?: string;
};

export type CalendarEventCreateInput = {
    workspaceId: string;
    departmentId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
    title: string;
    description?: string | null;
    startAt: string;
    endAt: string;
    allDay?: boolean;
    location?: string | null;
};

export type CalendarEventUpdateInput = Partial<
    Omit<CalendarEventCreateInput, "workspaceId">
>;

export type NotificationListArgs = PageArgs & {
    unread?: boolean;
};

export type NotificationCreateInput = {
    userId: string;
    type?: NotificationType;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
};

export type TagCreateInput = {
    workspaceId: string;
    name: string;
    color?: string;
};

export type AnalyticsArgs = {
    workspaceId?: string;
    departmentId?: string;
    from?: string;
    to?: string;
};

export type AiConversationCreateInput = {
    workspaceId: string;
    title?: string;
    model?: string;
};

export type AiMessageCreateInput = {
    content: string;
};

export type AiPlanRequest = {
    workspaceId: string;
    date?: string;
    availableMinutes?: number;
};

export type SettingsUpdateInput = {
    theme?: ThemeValue;
    locale?: LocaleValue;
    dailySummaryEmail?: boolean;
    overduePush?: boolean;
    teamMentions?: boolean;
    aiModel?: string;
};
