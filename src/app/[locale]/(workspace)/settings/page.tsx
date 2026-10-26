"use client";

import {useLocale, useTranslations} from "next-intl";
import {
    Bell,
    Building2,
    Check,
    KeyRound,
    LogOut,
    Monitor,
    Moon,
    Palette,
    Plus,
    Shield,
    Sun,
    Trash2,
    UserRound,
} from "lucide-react";
import {useSearchParams} from "next/navigation";
import {
    Suspense,
    useEffect,
    useMemo,
    useState,
} from "react";

import {useTheme} from "@/components/theme-provider";
import {Avatar} from "@/components/ui/avatar";
import {Badge, roleTone} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Checkbox,
    Field,
    Input,
    Select,
} from "@/components/ui/input";
import {Card, CardHeader, PageHeader} from "@/components/ui/layout";
import {ConfirmDialog} from "@/components/ui/modal";
import {PageLoader} from "@/components/ui/states";
import {Tabs} from "@/components/ui/tabs";
import {useToast} from "@/components/ui/toast";
import {useWorkspace} from "@/components/workspace/workspace-provider";
import {usePathname, useRouter} from "@/i18n/navigation";
import {routing} from "@/i18n/routing";
import {
    useCreateWorkspaceMutation,
    useDeleteWorkspaceMutation,
    useGetDepartmentsQuery,
    useGetSettingsQuery,
    useLogoutMutation,
    useUpdateSettingsMutation,
    useUpdateUserMutation,
    useUpdateWorkspaceMutation,
} from "@/lib/redux/api";
import {useAppDispatch} from "@/lib/redux/hooks";
import {setActiveWorkspace} from "@/lib/redux/workspace-slice";
import type {ThemeValue, WorkspacePlan} from "@/lib/domain";
import {
    cn,
    fileSize,
    formatDate,
    getApiErrorMessage,
} from "@/lib/utils";

type TabValue =
    | "profile"
    | "preferences"
    | "notifications"
    | "security"
    | "workspace";

const tabsConfig: Array<{
    value: TabValue;
    labelKey: string;
    icon: React.ReactNode;
}> = [
    {value: "profile", labelKey: "userProfile", icon: <UserRound size={14} />},
    {
        value: "preferences",
        labelKey: "themeAppearance",
        icon: <Palette size={14} />,
    },
    {
        value: "notifications",
        labelKey: "notificationsAI",
        icon: <Bell size={14} />,
    },
    {
        value: "security",
        labelKey: "securitySessions",
        icon: <Shield size={14} />,
    },
    {
        value: "workspace",
        labelKey: "workspaceSettings",
        icon: <Building2 size={14} />,
    },
];

const timezones = [
    "Asia/Tashkent",
    "Asia/Almaty",
    "Europe/Moscow",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Tokyo",
];

function SettingsContent() {
    const t = useTranslations("settings");
    const tCommon = useTranslations("common");
    const tWs = useTranslations("workspace");
    const tRole = useTranslations("role");
    const tWsRole = useTranslations("workspaceRole");
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const dispatch = useAppDispatch();
    const toast = useToast();
    const {theme, setTheme} = useTheme();
    const searchParams = useSearchParams();

    const {
        user,
        settings: contextSettings,
        workspace,
        workspaces,
        role,
        canManageWorkspace,
        isGlobalAdmin,
    } = useWorkspace();

    const initialTab = (searchParams.get("tab") as TabValue) || "profile";
    const [tab, setTab] = useState<TabValue>(
        tabsConfig.some((item) => item.value === initialTab)
            ? initialTab
            : "profile",
    );
    const [mounted, setMounted] = useState(false);

    const {data: settingsData} = useGetSettingsQuery();
    const settings = settingsData ?? contextSettings;

    const {data: departments} = useGetDepartmentsQuery(undefined, {
        skip: !isGlobalAdmin,
    });

    const [updateUser, updateUserState] = useUpdateUserMutation();
    const [updateSettings] = useUpdateSettingsMutation();
    const [updateWorkspace, updateWorkspaceState] =
        useUpdateWorkspaceMutation();
    const [createWorkspace, createWorkspaceState] =
        useCreateWorkspaceMutation();
    const [deleteWorkspace, deleteWorkspaceState] =
        useDeleteWorkspaceMutation();
    const [logout, logoutState] = useLogoutMutation();

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const value = searchParams.get("tab") as TabValue | null;
        if (value && tabsConfig.some((item) => item.value === value)) {
            setTab(value);
        }
    }, [searchParams]);

    // Profile
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email);
    const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
    const [timezone, setTimezone] = useState(user.timezone);
    const [departmentId, setDepartmentId] = useState(
        user.departmentId ?? "",
    );
    const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");

    useEffect(() => {
        setName(user.name);
        setEmail(user.email);
        setJobTitle(user.jobTitle ?? "");
        setTimezone(user.timezone);
        setDepartmentId(user.departmentId ?? "");
        setAvatarUrl(user.avatarUrl ?? "");
    }, [user]);

    // Security
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Preferences
    const [nextLocale, setNextLocale] = useState(locale);
    const [aiModel, setAiModel] = useState(settings.aiModel);

    useEffect(() => {
        setNextLocale(locale);
    }, [locale]);

    useEffect(() => {
        setAiModel(settings.aiModel);
    }, [settings.aiModel]);

    // Notifications
    const [prefs, setPrefs] = useState({
        dailySummaryEmail: settings.dailySummaryEmail,
        overduePush: settings.overduePush,
        teamMentions: settings.teamMentions,
    });

    useEffect(() => {
        setPrefs({
            dailySummaryEmail: settings.dailySummaryEmail,
            overduePush: settings.overduePush,
            teamMentions: settings.teamMentions,
        });
    }, [
        settings.dailySummaryEmail,
        settings.overduePush,
        settings.teamMentions,
    ]);

    // Workspace
    const [workspaceName, setWorkspaceName] = useState(workspace.name);
    const [workspacePlan, setWorkspacePlan] = useState<WorkspacePlan>(
        workspace.plan,
    );
    const [storageLimitGb, setStorageLimitGb] = useState(
        String(Math.round(workspace.storageLimitBytes / 1024 ** 3)),
    );
    const [newWorkspaceName, setNewWorkspaceName] = useState("");
    const [newWorkspaceSlug, setNewWorkspaceSlug] = useState("");
    const [newWorkspacePlan, setNewWorkspacePlan] =
        useState<WorkspacePlan>("free");
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        setWorkspaceName(workspace.name);
        setWorkspacePlan(workspace.plan);
        setStorageLimitGb(
            String(Math.round(workspace.storageLimitBytes / 1024 ** 3)),
        );
    }, [workspace]);

    const themeOptions: Array<{
        value: ThemeValue;
        label: string;
        description: string;
        icon: React.ReactNode;
    }> = [
        {
            value: "light",
            label: t("lightTheme"),
            description: t("lightThemeDescription"),
            icon: <Sun size={17} />,
        },
        {
            value: "dark",
            label: t("darkTheme"),
            description: t("darkThemeDescription"),
            icon: <Moon size={17} />,
        },
        {
            value: "system",
            label: t("systemAdaptive"),
            description: t("systemThemeDescription"),
            icon: <Monitor size={17} />,
        },
    ];

    const planOptions = useMemo(
        () => [
            {value: "free" as const, label: t("planFree")},
            {value: "pro" as const, label: t("planPro")},
            {value: "business" as const, label: t("planBusiness")},
        ],
        [t],
    );

    const saveProfile = async () => {
        try {
            await updateUser({
                id: user.id,
                data: {
                    name: name.trim(),
                    email: email.trim(),
                    jobTitle: jobTitle.trim() || null,
                    timezone,
                    avatarUrl: avatarUrl.trim() || null,
                    ...(isGlobalAdmin
                        ? {departmentId: departmentId || null}
                        : {}),
                },
            }).unwrap();
            toast.success(t("profileSaved"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("profileError")));
        }
    };

    const changePassword = async () => {
        if (password.length < 8) {
            toast.error(t("passwordTooShort"));
            return;
        }
        if (password !== confirmPassword) {
            toast.error(t("passwordMismatch"));
            return;
        }
        try {
            await updateUser({id: user.id, data: {password}}).unwrap();
            setPassword("");
            setConfirmPassword("");
            toast.success(t("passwordSaved"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("passwordError")));
        }
    };

    const selectTheme = async (value: ThemeValue) => {
        setTheme(value);
        try {
            await updateSettings({theme: value}).unwrap();
            toast.success(t("preferencesSaved"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("preferencesError")));
        }
    };

    const selectLocale = async (value: string) => {
        setNextLocale(value as (typeof routing.locales)[number]);
        try {
            await updateSettings({
                locale: value as (typeof routing.locales)[number],
            }).unwrap();
            router.replace(pathname, {
                locale: value as (typeof routing.locales)[number],
            });
            router.refresh();
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("preferencesError")));
        }
    };

    const selectModel = async (value: string) => {
        setAiModel(value);
        try {
            await updateSettings({aiModel: value}).unwrap();
            toast.success(t("preferencesSaved"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("preferencesError")));
        }
    };

    const togglePref = async (
        key: "dailySummaryEmail" | "overduePush" | "teamMentions",
        value: boolean,
    ) => {
        setPrefs((current) => ({...current, [key]: value}));
        try {
            await updateSettings({[key]: value}).unwrap();
        } catch (error) {
            setPrefs((current) => ({...current, [key]: !value}));
            toast.error(getApiErrorMessage(error, t("preferencesError")));
        }
    };

    const saveWorkspace = async () => {
        try {
            const limit = Number(storageLimitGb);
            await updateWorkspace({
                id: workspace.id,
                data: {
                    name: workspaceName.trim(),
                    plan: workspacePlan,
                    storageLimitBytes:
                        Number.isFinite(limit) && limit > 0
                            ? Math.round(limit * 1024 ** 3)
                            : undefined,
                },
            }).unwrap();
            toast.success(t("workspaceSaved"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("workspaceError")));
        }
    };

    const addWorkspace = async () => {
        const slug = newWorkspaceSlug
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^-+|-+$/g, "");
        try {
            const created = await createWorkspace({
                name: newWorkspaceName.trim(),
                slug,
                plan: newWorkspacePlan,
            }).unwrap();
            dispatch(setActiveWorkspace(created.id));
            setNewWorkspaceName("");
            setNewWorkspaceSlug("");
            setNewWorkspacePlan("free");
            toast.success(t("workspaceCreated"));
        } catch (error) {
            toast.error(
                getApiErrorMessage(error, t("workspaceCreateError")),
            );
        }
    };

    const removeWorkspace = async () => {
        try {
            await deleteWorkspace({id: workspace.id}).unwrap();
            setConfirmDelete(false);
            toast.success(t("workspaceDeleted"));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t("workspaceDeleteError")));
        }
    };

    const signOut = async () => {
        try {
            await logout().unwrap();
        } finally {
            router.replace("/login");
            router.refresh();
        }
    };

    const canDeleteWorkspace =
        role === "owner" && workspace.ownerId === user.id;

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={t("eyebrow")}
                title={t("title")}
                description={t("description")}
                actions={
                    <Badge tone="success" className="h-8 px-3">
                        <span className="size-1.5 rounded-full bg-success" />
                        {t("syncCloudActive")}
                    </Badge>
                }
            />

            <Tabs
                value={tab}
                onChange={setTab}
                items={tabsConfig.map((item) => ({
                    value: item.value,
                    label: (
                        <span className="inline-flex items-center gap-1.5">
                            {item.icon}
                            {t(item.labelKey)}
                        </span>
                    ),
                }))}
                className="flex-wrap overflow-x-visible"
            />

            {tab === "profile" ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <Card>
                        <CardHeader
                            title={t("userProfile")}
                            description={t("profileDescription")}
                            action={
                                <Button
                                    size="sm"
                                    onClick={() => void saveProfile()}
                                    loading={updateUserState.isLoading}
                                >
                                    {tCommon("saveChanges")}
                                </Button>
                            }
                        />
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-elevated/50 p-3">
                                <Avatar
                                    name={name || user.name}
                                    src={avatarUrl || null}
                                    size="lg"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-text-primary">
                                        {t("profilePhoto")}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-text-muted">
                                        {t("avatarUrlHint")}
                                    </p>
                                    <Input
                                        value={avatarUrl}
                                        onChange={(event) =>
                                            setAvatarUrl(event.target.value)
                                        }
                                        placeholder="https://..."
                                        className="mt-2 h-9 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t("fullName")} required>
                                    <Input
                                        value={name}
                                        onChange={(event) =>
                                            setName(event.target.value)
                                        }
                                    />
                                </Field>
                                <Field label={t("emailAddress")} required>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(event) =>
                                            setEmail(event.target.value)
                                        }
                                    />
                                </Field>
                                <Field label={t("organizationRole")}>
                                    <Input
                                        value={jobTitle}
                                        onChange={(event) =>
                                            setJobTitle(event.target.value)
                                        }
                                    />
                                </Field>
                                <Field label={t("timeZone")}>
                                    <Select
                                        value={timezone}
                                        onChange={(event) =>
                                            setTimezone(event.target.value)
                                        }
                                    >
                                        {timezones.map((zone) => (
                                            <option key={zone} value={zone}>
                                                {zone}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                {isGlobalAdmin ? (
                                    <Field
                                        label={t("department")}
                                        className="sm:col-span-2"
                                    >
                                        <Select
                                            value={departmentId}
                                            onChange={(event) =>
                                                setDepartmentId(
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            <option value="">
                                                {t("noDepartment")}
                                            </option>
                                            {(departments ?? []).map(
                                                (department) => (
                                                    <option
                                                        key={department.id}
                                                        value={department.id}
                                                    >
                                                        {department.name}
                                                    </option>
                                                ),
                                            )}
                                        </Select>
                                    </Field>
                                ) : null}
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader title={t("accountSummary")} />
                            <div className="space-y-3 text-xs">
                                <div>
                                    <p className="text-text-muted">
                                        {t("accountId")}
                                    </p>
                                    <p className="mt-0.5 break-all font-mono text-text-primary">
                                        {user.id}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-text-muted">
                                        {t("organizationRole")}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <Badge tone="primary">
                                            {tRole(user.role)}
                                        </Badge>
                                        <Badge tone={roleTone[role]}>
                                            {tWsRole(role)}
                                        </Badge>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-text-muted">
                                        {t("memberSince")}
                                    </p>
                                    <p className="mt-0.5 text-text-primary">
                                        {formatDate(user.createdAt, locale)}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <CardHeader
                                title={t("workspaceSettings")}
                                description={workspace.name}
                            />
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setTab("workspace")}
                            >
                                <Building2 size={15} />
                                {t("openWorkspaceSettings")}
                            </Button>
                        </Card>
                    </div>
                </div>
            ) : null}

            {tab === "preferences" ? (
                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader
                            title={t("accountThemePreference")}
                            description={t("themeDescription")}
                        />
                        <div className="grid gap-2">
                            {themeOptions.map((option) => {
                                const active =
                                    mounted && theme === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() =>
                                            void selectTheme(option.value)
                                        }
                                        className={cn(
                                            "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                                            active
                                                ? "border-primary bg-primary/5"
                                                : "border-border hover:bg-surface-hover",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                                                active
                                                    ? "bg-primary/10 text-primary"
                                                    : "bg-surface-elevated text-text-muted",
                                            )}
                                        >
                                            {option.icon}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-text-primary">
                                                {option.label}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-text-secondary">
                                                {option.description}
                                            </span>
                                        </span>
                                        {active ? (
                                            <Check
                                                size={16}
                                                className="mt-1 shrink-0 text-primary"
                                            />
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader
                                title={t("language")}
                                description={t("languageDescription")}
                            />
                            <Select
                                value={nextLocale}
                                onChange={(event) =>
                                    void selectLocale(event.target.value)
                                }
                            >
                                {routing.locales.map((item) => (
                                    <option key={item} value={item}>
                                        {item === "ru"
                                            ? "Русский"
                                            : item === "uz"
                                              ? "O‘zbekcha"
                                              : "English"}
                                    </option>
                                ))}
                            </Select>
                        </Card>

                        <Card>
                            <CardHeader
                                title={t("aiModel")}
                                description={t("aiModelDescription")}
                            />
                            <Select
                                value={aiModel}
                                onChange={(event) =>
                                    void selectModel(event.target.value)
                                }
                            >
                                <option value="taskflow-rules-v1">
                                    TaskFlow Rules v1
                                </option>
                                <option value="taskflow-pro">TaskFlow Pro</option>
                                <option value="taskflow-experimental">
                                    TaskFlow Experimental
                                </option>
                            </Select>
                        </Card>
                    </div>
                </div>
            ) : null}

            {tab === "notifications" ? (
                <Card>
                    <CardHeader
                        title={t("notificationPreferences")}
                        description={t("notificationDescription")}
                    />
                    <div className="space-y-2">
                        <Checkbox
                            checked={prefs.dailySummaryEmail}
                            onChange={(event) =>
                                void togglePref(
                                    "dailySummaryEmail",
                                    event.target.checked,
                                )
                            }
                            label={t("dailySummaryEmail")}
                            description={t("dailySummaryDescription")}
                        />
                        <Checkbox
                            checked={prefs.overduePush}
                            onChange={(event) =>
                                void togglePref(
                                    "overduePush",
                                    event.target.checked,
                                )
                            }
                            label={t("overduePushNotifications")}
                            description={t("overduePushDescription")}
                        />
                        <Checkbox
                            checked={prefs.teamMentions}
                            onChange={(event) =>
                                void togglePref(
                                    "teamMentions",
                                    event.target.checked,
                                )
                            }
                            label={t("teamMentionsAssignments")}
                            description={t("teamMentionsDescription")}
                        />
                    </div>
                    <p className="mt-3 text-[11px] text-text-muted">
                        {t("unsavedChanges")}
                    </p>
                </Card>
            ) : null}

            {tab === "security" ? (
                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader
                            title={t("securityActiveSessions")}
                            description={t("securityDescription")}
                        />
                        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-text-primary">
                                        {t("currentSession")}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-text-muted">
                                        {t("sessionLastActive", {
                                            time: formatDate(
                                                new Date(),
                                                locale,
                                                {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                },
                                            ),
                                        })}
                                    </p>
                                </div>
                                <Badge tone="success">
                                    {tCommon("active")}
                                </Badge>
                            </div>
                            <div className="mt-2 space-y-1 text-[11px] text-text-secondary">
                                <p>{user.email}</p>
                                <p>{user.timezone}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-[11px] text-text-muted">
                            {t("securityNote")}
                        </p>
                        <Button
                            variant="danger"
                            className="mt-3 w-full"
                            onClick={() => void signOut()}
                            loading={logoutState.isLoading}
                        >
                            <LogOut size={15} />
                            {t("signOut")}
                        </Button>
                    </Card>

                    <Card>
                        <CardHeader
                            title={t("changePassword")}
                            description={t("changePasswordDescription")}
                            action={<KeyRound size={16} className="text-text-muted" />}
                        />
                        <div className="space-y-3">
                            <Field label={t("newPassword")}>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                />
                            </Field>
                            <Field
                                label={t("confirmPassword")}
                                hint={t("passwordHint")}
                            >
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) =>
                                        setConfirmPassword(event.target.value)
                                    }
                                    autoComplete="new-password"
                                    placeholder="••••••••"
                                />
                            </Field>
                            <Button
                                onClick={() => void changePassword()}
                                loading={updateUserState.isLoading}
                                disabled={
                                    password.length === 0 ||
                                    confirmPassword.length === 0
                                }
                            >
                                {t("updatePassword")}
                            </Button>
                        </div>
                    </Card>
                </div>
            ) : null}

            {tab === "workspace" ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader
                                title={t("workspaceSettings")}
                                description={t("workspaceDescription")}
                                action={
                                    canManageWorkspace ? (
                                        <Button
                                            size="sm"
                                            onClick={() => void saveWorkspace()}
                                            loading={updateWorkspaceState.isLoading}
                                        >
                                            {tCommon("saveChanges")}
                                        </Button>
                                    ) : (
                                        <Badge tone="neutral">
                                            {t("readOnly")}
                                        </Badge>
                                    )
                                }
                            />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t("workspaceName")}>
                                    <Input
                                        value={workspaceName}
                                        onChange={(event) =>
                                            setWorkspaceName(event.target.value)
                                        }
                                        disabled={!canManageWorkspace}
                                    />
                                </Field>
                                <Field label={t("workspacePlan")}>
                                    <Select
                                        value={workspacePlan}
                                        onChange={(event) =>
                                            setWorkspacePlan(
                                                event.target
                                                    .value as WorkspacePlan,
                                            )
                                        }
                                        disabled={!canManageWorkspace}
                                    >
                                        {planOptions.map((option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field
                                    label={t("storageLimit")}
                                    hint={`${t("storageUsed")}: ${fileSize(workspace.storageUsedBytes)}`}
                                >
                                    <Input
                                        type="number"
                                        min={1}
                                        value={storageLimitGb}
                                        onChange={(event) =>
                                            setStorageLimitGb(
                                                event.target.value,
                                            )
                                        }
                                        disabled={!canManageWorkspace}
                                    />
                                </Field>
                                <Field label={t("workspaceSlugReadonly")}>
                                    <Input
                                        value={workspace.slug}
                                        disabled
                                    />
                                </Field>
                            </div>
                        </Card>

                        {canManageWorkspace ? (
                            <Card>
                                <CardHeader
                                    title={t("createWorkspace")}
                                    description={t("createWorkspaceDescription")}
                                    action={<Plus size={16} className="text-text-muted" />}
                                />
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Field label={t("workspaceName")}>
                                        <Input
                                            value={newWorkspaceName}
                                            onChange={(event) => {
                                                setNewWorkspaceName(
                                                    event.target.value,
                                                );
                                                if (!newWorkspaceSlug) {
                                                    setNewWorkspaceSlug(
                                                        event.target.value
                                                            .toLowerCase()
                                                            .replace(
                                                                /[^a-z0-9-]+/g,
                                                                "-",
                                                            )
                                                            .replace(
                                                                /^-+|-+$/g,
                                                                "",
                                                            ),
                                                    );
                                                }
                                            }}
                                            placeholder="Product Lab"
                                        />
                                    </Field>
                                    <Field label={t("workspaceSlugReadonly")}>
                                        <Input
                                            value={newWorkspaceSlug}
                                            onChange={(event) =>
                                                setNewWorkspaceSlug(
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="product-lab"
                                        />
                                    </Field>
                                    <Field label={t("workspacePlan")}>
                                        <Select
                                            value={newWorkspacePlan}
                                            onChange={(event) =>
                                                setNewWorkspacePlan(
                                                    event.target
                                                        .value as WorkspacePlan,
                                                )
                                            }
                                        >
                                            {planOptions.map((option) => (
                                                <option
                                                    key={option.value}
                                                    value={option.value}
                                                >
                                                    {option.label}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                </div>
                                <Button
                                    className="mt-3"
                                    variant="outline"
                                    onClick={() => void addWorkspace()}
                                    loading={createWorkspaceState.isLoading}
                                    disabled={
                                        newWorkspaceName.trim().length < 2 ||
                                        newWorkspaceSlug.length < 2
                                    }
                                >
                                    <Plus size={15} />
                                    {t("createWorkspaceButton")}
                                </Button>
                            </Card>
                        ) : null}

                        {canDeleteWorkspace ? (
                            <Card className="border-error/30">
                                <CardHeader
                                    title={t("dangerZone")}
                                    description={t("dangerZoneDescription")}
                                />
                                <Button
                                    variant="danger"
                                    onClick={() => setConfirmDelete(true)}
                                >
                                    <Trash2 size={15} />
                                    {t("deleteWorkspace")}
                                </Button>
                            </Card>
                        ) : null}
                    </div>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader
                                title={tWs("workspaces")}
                                description={t("workspaceListDescription")}
                            />
                            <div className="space-y-1.5">
                                {workspaces.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() =>
                                            dispatch(
                                                setActiveWorkspace(item.id),
                                            )
                                        }
                                        className={cn(
                                            "flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-colors",
                                            item.id === workspace.id
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-border hover:bg-surface-hover",
                                        )}
                                    >
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <Building2 size={15} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-semibold text-text-primary">
                                                {item.name}
                                            </span>
                                            <span className="text-[10px] text-text-muted">
                                                {planOptions.find(
                                                    (option) =>
                                                        option.value ===
                                                        item.plan,
                                                )?.label ?? item.plan}{" "}
                                                · {item.memberCount}{" "}
                                                {tWs("members")}
                                            </span>
                                        </span>
                                        {item.id === workspace.id ? (
                                            <Badge tone="primary">
                                                {tWs("current")}
                                            </Badge>
                                        ) : (
                                            <span className="text-[10px] text-primary">
                                                {t("switchTo")}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </Card>

                        <Card>
                            <CardHeader title={t("workspaceStats")} />
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-lg bg-surface-elevated p-2">
                                    <p className="text-lg font-semibold tabular-nums text-text-primary">
                                        {workspace.memberCount}
                                    </p>
                                    <p className="text-[10px] text-text-muted">
                                        {tWs("members")}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-surface-elevated p-2">
                                    <p className="text-lg font-semibold tabular-nums text-text-primary">
                                        {workspace.projectCount}
                                    </p>
                                    <p className="text-[10px] text-text-muted">
                                        {tWs("projects")}
                                    </p>
                                </div>
                                <div className="rounded-lg bg-surface-elevated p-2">
                                    <p className="text-lg font-semibold tabular-nums text-text-primary">
                                        {workspace.taskCount}
                                    </p>
                                    <p className="text-[10px] text-text-muted">
                                        {t("tasksLabel")}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-3 text-[11px] text-text-muted">
                                {t("roleInWorkspace")}:{" "}
                                <span className="font-medium text-text-primary">
                                    {tWsRole(role)}
                                </span>
                            </p>
                        </Card>
                    </div>
                </div>
            ) : null}

            <ConfirmDialog
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title={t("deleteWorkspaceTitle")}
                description={t("deleteWorkspaceDescription", {
                    name: workspace.name,
                })}
                confirmLabel={t("deleteWorkspace")}
                cancelLabel={tCommon("cancel")}
                loading={deleteWorkspaceState.isLoading}
                onConfirm={() => void removeWorkspace()}
            />
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<PageLoader />}>
            <SettingsContent />
        </Suspense>
    );
}
