"use client";

import {useLocale, useTranslations} from "next-intl";
import {Building2} from "lucide-react";
import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
} from "react";

import {useRouter} from "@/i18n/navigation";
import {
    useGetMeQuery,
    useGetWorkspacesQuery,
} from "@/lib/redux/api";
import {useAppDispatch, useAppSelector} from "@/lib/redux/hooks";
import {setActiveWorkspace} from "@/lib/redux/workspace-slice";
import type {
    AuthUser,
    Membership,
    UserSettings,
    WorkspaceListItem,
} from "@/lib/redux/types";
import type {WorkspaceRole} from "@/lib/domain";
import {getApiErrorStatus} from "@/lib/utils";
import {PageLoader} from "@/components/ui/states";

type WorkspaceContextValue = {
    user: AuthUser;
    settings: UserSettings;
    memberships: Membership[];
    workspaces: WorkspaceListItem[];
    workspace: WorkspaceListItem;
    role: WorkspaceRole;
    canManageWorkspace: boolean;
    canEdit: boolean;
    isGlobalAdmin: boolean;
    canManageUsers: boolean;
    canManageDepartments: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({children}: {children: ReactNode}) {
    const t = useTranslations("workspaceState");
    const locale = useLocale();
    const router = useRouter();
    const dispatch = useAppDispatch();
    const activeWorkspaceId = useAppSelector(
        (state) => state.workspace.activeWorkspaceId,
    );

    const {
        data: me,
        isLoading: meLoading,
        isError: meError,
        error: meQueryError,
        refetch: refetchMe,
    } = useGetMeQuery(undefined, {
        refetchOnMountOrArgChange: true,
        refetchOnFocus: true,
    });

    const {
        data: workspaces,
        isLoading: workspacesLoading,
        isError: workspacesError,
        refetch: refetchWorkspaces,
    } = useGetWorkspacesQuery(undefined, {
        skip: !me,
    });

    const unauthorized =
        getApiErrorStatus(meQueryError) === 401 ||
        getApiErrorStatus(meQueryError) === 403;

    useEffect(() => {
        if (!unauthorized) return;
        router.replace("/login");
    }, [unauthorized, router]);

    useEffect(() => {
        if (!workspaces || workspaces.length === 0) return;
        const exists = workspaces.some(
            (workspace) => workspace.id === activeWorkspaceId,
        );
        if (!exists) {
            dispatch(setActiveWorkspace(workspaces[0].id));
        }
    }, [workspaces, activeWorkspaceId, dispatch]);

    const workspace = useMemo(() => {
        if (!workspaces || workspaces.length === 0) return null;
        return (
            workspaces.find((item) => item.id === activeWorkspaceId) ??
            workspaces[0]
        );
    }, [workspaces, activeWorkspaceId]);

    const value = useMemo<WorkspaceContextValue | null>(() => {
        if (!me || !workspace) return null;

        const role: WorkspaceRole =
            workspace.role ?? (me.user.role === "admin" ? "admin" : "viewer");

        return {
            user: me.user,
            settings: me.settings,
            memberships: me.memberships,
            workspaces: workspaces ?? [],
            workspace,
            role,
            canManageWorkspace: role === "owner" || role === "admin",
            canEdit: role !== "viewer",
            isGlobalAdmin: me.user.role === "admin",
            canManageUsers: me.user.role === "admin" || me.user.role === "manager",
            canManageDepartments:
                me.user.role === "admin" || me.user.role === "manager",
        };
    }, [me, workspace, workspaces]);

    if (meLoading || (me && workspacesLoading)) {
        return <PageLoader label={t("loading")} />;
    }

    if (unauthorized) {
        return <PageLoader label={t("redirecting")} />;
    }

    if (meError) {
        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-error">{t("loadError")}</p>
                <button
                    type="button"
                    onClick={() => {
                        void refetchMe();
                        void refetchWorkspaces();
                    }}
                    className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white"
                >
                    {t("retry")}
                </button>
            </div>
        );
    }

    if (me && workspacesError) {
        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-error">{t("workspaceError")}</p>
                <button
                    type="button"
                    onClick={() => void refetchWorkspaces()}
                    className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white"
                >
                    {t("retry")}
                </button>
            </div>
        );
    }

    if (me && workspaces && workspaces.length === 0) {
        return (
            <div className="flex min-h-dvh items-center justify-center px-6">
                <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
                    <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Building2 size={22} />
                    </span>
                    <h1 className="text-lg font-semibold text-text-primary">
                        {t("noWorkspaceTitle")}
                    </h1>
                    <p className="mt-2 text-sm text-text-secondary">
                        {t("noWorkspaceDescription")}
                    </p>
                    <button
                        type="button"
                        onClick={() => router.replace("/settings")}
                        className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white"
                    >
                        {t("openSettings")}
                    </button>
                    <p className="mt-4 text-xs text-text-muted">
                        {t("askAdmin", {locale})}
                    </p>
                </div>
            </div>
        );
    }

    if (!value) {
        return <PageLoader label={t("loading")} />;
    }

    return (
        <WorkspaceContext.Provider value={value}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace() {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error("useWorkspace must be used inside WorkspaceProvider");
    }
    return context;
}
