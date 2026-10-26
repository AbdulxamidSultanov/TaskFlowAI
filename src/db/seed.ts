import bcrypt from "bcryptjs";

import {db, sqlite} from "./index";
import {
    aiConversations,
    aiMessages,
    aiPlanItems,
    aiPlans,
    calendarEvents,
    comments,
    departments,
    notifications,
    projects,
    sessions,
    tags,
    taskTags,
    tasks,
    userSettings,
    users,
    workspaceMembers,
    workspaces,
} from "./schema";
import type {TaskPriority, TaskStatus} from "@/lib/domain";

type DepartmentSeed = {
    id: string;
    name: string;
    slug: string;
    description: string;
    color: string;
    prefix: string;
    people: Array<{name: string; jobTitle: string}>;
    projects: string[];
    tasks: string[];
    comments: string[];
};

const departmentSeeds: DepartmentSeed[] = [
    {
        id: "dept-engineering",
        name: "Engineering",
        slug: "engineering",
        description: "Platform, product engineering and infrastructure.",
        color: "#4F46E5",
        prefix: "ENG",
        people: [
            {name: "Aziz Karimov", jobTitle: "Engineering Manager"},
            {name: "Dilnoza Ismoilova", jobTitle: "Senior Backend Engineer"},
            {name: "Jasur Tursunov", jobTitle: "Frontend Engineer"},
            {name: "Madina Rakhimova", jobTitle: "QA Engineer"},
            {name: "Bekzod Yusupov", jobTitle: "DevOps Engineer"},
        ],
        projects: [
            "Platform Core",
            "Mobile App",
            "API Gateway",
            "Realtime Sync",
            "Developer Portal",
        ],
        tasks: [
            "Ship authentication hardening",
            "Fix realtime sync race condition",
            "Optimize dashboard queries",
            "Add API rate limiting",
            "Upgrade CI pipeline",
        ],
        comments: [
            "Security review is done, one cookie flag left.",
            "Reproduced on two devices; adding a regression test.",
            "Query plan improved from 1.8s to 240ms.",
            "Draft limits agreed with product.",
            "Cache restore is now under 40 seconds.",
        ],
    },
    {
        id: "dept-product",
        name: "Product",
        slug: "product",
        description: "Roadmap, discovery and product operations.",
        color: "#0EA5E9",
        prefix: "PRD",
        people: [
            {name: "Kamila Saidova", jobTitle: "Head of Product"},
            {name: "Rustam Abdullaev", jobTitle: "Product Manager"},
            {name: "Sevara Nazarova", jobTitle: "Product Analyst"},
            {name: "Timur Khamidov", jobTitle: "Technical Writer"},
            {name: "Nigora Yuldasheva", jobTitle: "Product Operations"},
        ],
        projects: [
            "Q4 Roadmap",
            "Onboarding 2.0",
            "Billing Revamp",
            "Customer Feedback",
            "Usage Analytics",
        ],
        tasks: [
            "Finalize Q4 roadmap",
            "Write onboarding spec",
            "Review billing edge cases",
            "Analyze churn survey",
            "Prepare sprint review",
        ],
        comments: [
            "Roadmap reviewed with department leads.",
            "Added acceptance criteria for empty states.",
            "Finance confirmed the proration rules.",
            "Top three churn reasons identified.",
            "Demo data is ready for the sprint review.",
        ],
    },
    {
        id: "dept-design",
        name: "Design",
        slug: "design",
        description: "Product design, brand and design systems.",
        color: "#EC4899",
        prefix: "DSN",
        people: [
            {name: "Malika Ergasheva", jobTitle: "Design Lead"},
            {name: "Sardor Mirzaev", jobTitle: "Product Designer"},
            {name: "Zarina Akhmedova", jobTitle: "UX Researcher"},
            {name: "Otabek Sattorov", jobTitle: "Brand Designer"},
            {name: "Nilufar Qodirova", jobTitle: "Design Systems Designer"},
        ],
        projects: [
            "Design System 2.0",
            "Mobile UI Refresh",
            "Brand Guidelines",
            "Onboarding Flows",
            "Marketing Site",
        ],
        tasks: [
            "Audit design tokens",
            "Design mobile task cards",
            "Update brand illustration set",
            "Prototype onboarding empty states",
            "Prepare design QA checklist",
        ],
        comments: [
            "Found 14 legacy token aliases.",
            "Card density options are in Figma.",
            "Illustrations now use the new palette.",
            "Prototype covers first-run and no-results states.",
            "Checklist covers desktop and mobile breakpoints.",
        ],
    },
    {
        id: "dept-marketing",
        name: "Marketing",
        slug: "marketing",
        description: "Growth, content, events and partnerships.",
        color: "#F59E0B",
        prefix: "MKT",
        people: [
            {name: "Shahnoza Alimova", jobTitle: "Marketing Lead"},
            {name: "Farrukh Nazarov", jobTitle: "Content Strategist"},
            {name: "Lola Tashkentova", jobTitle: "Growth Manager"},
            {name: "Anvar Rakhmonov", jobTitle: "SEO Specialist"},
            {name: "Gulnora Karimova", jobTitle: "Partnership Manager"},
        ],
        projects: [
            "Product Launch",
            "Content Engine",
            "SEO Growth",
            "Partner Program",
            "Lifecycle Email",
        ],
        tasks: [
            "Draft launch announcement",
            "Plan webinar sequence",
            "Refresh SEO landing page",
            "Build partner one-pager",
            "Set up lifecycle email",
        ],
        comments: [
            "Draft is ready for the launch review.",
            "Webinar dates proposed for the first two weeks.",
            "Primary keyword moved from page 6 to page 3.",
            "One-pager includes partner tiers and margins.",
            "Lifecycle flow has five emails and two branches.",
        ],
    },
    {
        id: "dept-operations",
        name: "Operations",
        slug: "operations",
        description: "People, finance, office and customer support.",
        color: "#10B981",
        prefix: "OPS",
        people: [
            {name: "Javohir Usmonov", jobTitle: "Operations Manager"},
            {name: "Munisa Tursunova", jobTitle: "People Partner"},
            {name: "Akmal Rashidov", jobTitle: "Finance Specialist"},
            {name: "Feruza Sobirova", jobTitle: "Support Lead"},
            {name: "Davron Yoldoshev", jobTitle: "Office Manager"},
        ],
        projects: [
            "Hiring Pipeline",
            "Vendor Management",
            "Office Move",
            "Support Playbook",
            "Finance Automation",
        ],
        tasks: [
            "Automate vendor approvals",
            "Document support escalation",
            "Plan office move",
            "Refresh hiring scorecards",
            "Reconcile monthly invoices",
        ],
        comments: [
            "Approval flow now has two sign-off levels.",
            "Escalation matrix covers P1 and P2 incidents.",
            "Move checklist is split by week.",
            "Scorecards updated for all engineering roles.",
            "Three invoices need vendor confirmation.",
        ],
    },
];

const taskStatuses: TaskStatus[] = [
    "in_progress",
    "todo",
    "under_review",
    "blocked",
    "completed",
];
const taskPriorities: TaskPriority[] = [
    "urgent",
    "high",
    "medium",
    "low",
    "high",
];
const taskEstimates = [120, 90, 60, 45, 30];
const dueOffsets = [1, 3, 7, -2, -5];
const workStatuses: Array<"active" | "paused" | "completed"> = [
    "active",
    "active",
    "paused",
    "active",
    "completed",
];

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "");
}

function localDay(offset: number, hour: number, minute = 0) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    date.setHours(hour, minute, 0, 0);
    return date;
}

async function resetDatabase() {
    await db.delete(aiPlanItems);
    await db.delete(aiPlans);
    await db.delete(aiMessages);
    await db.delete(aiConversations);
    await db.delete(notifications);
    await db.delete(calendarEvents);
    await db.delete(comments);
    await db.delete(taskTags);
    await db.delete(tags);
    await db.delete(tasks);
    await db.delete(projects);
    await db.delete(workspaceMembers);
    await db.delete(workspaces);
    await db.delete(sessions);
    await db.delete(userSettings);
    await db.delete(users);
    await db.delete(departments);
}

async function main() {
    console.log("Resetting TaskFlowAI database...");
    await resetDatabase();

    const sharedPasswordHash = await bcrypt.hash("Password123!", 10);
    const demoPasswordHash = await bcrypt.hash("Demo1234!", 10);

    await db.insert(departments).values(
        departmentSeeds.map((department) => ({
            id: department.id,
            name: department.name,
            slug: department.slug,
            description: department.description,
            color: department.color,
            createdAt: localDay(-30, 10),
            updatedAt: localDay(-1, 10),
        })),
    );

    const demoUserId = "user-demo";
    await db.insert(users).values({
        id: demoUserId,
        name: "Demo Admin",
        email: "demo@taskflow.ai",
        passwordHash: demoPasswordHash,
        role: "admin",
        departmentId: "dept-product",
        jobTitle: "Workspace Admin",
        timezone: "Asia/Tashkent",
        createdAt: localDay(-30, 10),
        updatedAt: localDay(-1, 10),
    });

    const userRows = departmentSeeds.flatMap((department) =>
        department.people.map((person, index) => ({
            id: `user-${department.slug}-${index + 1}`,
            name: person.name,
            email: `${slugify(person.name)}@taskflow.ai`,
            passwordHash: sharedPasswordHash,
            role: index === 0 ? ("manager" as const) : ("member" as const),
            departmentId: department.id,
            jobTitle: person.jobTitle,
            timezone: "Asia/Tashkent",
            createdAt: localDay(-25 + index, 10),
            updatedAt: localDay(-1, 10),
        })),
    );

    await db.insert(users).values(userRows);
    await db.insert(userSettings).values(
        [demoUserId, ...userRows.map((user) => user.id)].map((userId) => ({
            userId,
            theme: "system" as const,
            locale: "ru" as const,
            dailySummaryEmail: true,
            overduePush: true,
            teamMentions: true,
            aiModel: "taskflow-rules-v1",
            updatedAt: localDay(-1, 10),
        })),
    );

    const workspaceId = "ws-taskflow-hq";
    await db.insert(workspaces).values({
        id: workspaceId,
        name: "TaskFlow HQ",
        slug: "taskflow-hq",
        ownerId: demoUserId,
        plan: "business",
        storageUsedBytes: 320 * 1024 * 1024,
        storageLimitBytes: 20 * 1024 * 1024 * 1024,
        createdAt: localDay(-30, 10),
        updatedAt: localDay(-1, 10),
    });

    await db.insert(workspaceMembers).values([
        {
            id: "member-demo",
            workspaceId,
            userId: demoUserId,
            role: "owner",
            joinedAt: localDay(-30, 10),
        },
        ...userRows.map((user, index) => ({
            id: `member-${index + 1}`,
            workspaceId,
            userId: user.id,
            role: user.role === "manager" ? ("admin" as const) : ("member" as const),
            joinedAt: localDay(-20 + (index % 10), 10),
        })),
    ]);

    const projectRows = departmentSeeds.flatMap((department) =>
        department.projects.map((name, index) => ({
            id: `project-${department.slug}-${index + 1}`,
            workspaceId,
            departmentId: department.id,
            name,
            key: `${department.prefix}-${index + 1}`,
            description: `${name} — ${department.name} initiative.`,
            color: department.color,
            status: workStatuses[index],
            ownerId: `user-${department.slug}-1`,
            startDate: localDay(-21 + index, 9),
            dueDate: localDay(14 + index * 7, 18),
            createdAt: localDay(-21 + index, 9),
            updatedAt: localDay(-1, 12),
        })),
    );
    await db.insert(projects).values(projectRows);

    const taskRows = departmentSeeds.flatMap((department, departmentIndex) =>
        department.tasks.map((title, index) => {
            const status = taskStatuses[index];
            const completed = status === "completed";
            return {
                id: `task-${department.slug}-${index + 1}`,
                workspaceId,
                projectId: `project-${department.slug}-${index + 1}`,
                departmentId: department.id,
                parentTaskId: null,
                title,
                description: `${title}. Owner: ${department.people[(index + 1) % 5].name}.`,
                status,
                priority: taskPriorities[index],
                assigneeId: `user-${department.slug}-${((index + 1) % 5) + 1}`,
                creatorId: `user-${department.slug}-1`,
                startDate: localDay(-7 + index, 9),
                dueDate: localDay(dueOffsets[index], 18),
                estimateMinutes: taskEstimates[index],
                position: index,
                completedAt: completed ? localDay(-1, 16) : null,
                createdAt: localDay(-14 + departmentIndex + index, 10),
                updatedAt: localDay(-1, 15),
            };
        }),
    );
    await db.insert(tasks).values(taskRows);

    const tagRows = departmentSeeds.map((department) => ({
        id: `tag-${department.slug}`,
        workspaceId,
        name: department.name,
        color: department.color,
        createdAt: localDay(-20, 10),
    }));
    await db.insert(tags).values(tagRows);
    await db.insert(taskTags).values(
        taskRows.map((task, index) => ({
            id: `task-tag-${index + 1}`,
            taskId: task.id,
            tagId: `tag-${departmentSeeds[Math.floor(index / 5)].slug}`,
        })),
    );

    await db.insert(comments).values(
        departmentSeeds.flatMap((department, departmentIndex) =>
            department.comments.map((body, index) => ({
                id: `comment-${department.slug}-${index + 1}`,
                taskId: `task-${department.slug}-${index + 1}`,
                authorId: `user-${department.slug}-1`,
                body,
                createdAt: localDay(-3 + departmentIndex, 11 + index),
                updatedAt: localDay(-1, 11 + index),
            })),
        ),
    );

    await db.insert(calendarEvents).values(
        departmentSeeds.flatMap((department, departmentIndex) =>
            department.tasks.map((title, index) => {
                const startAt = localDay(index - 1, 9 + departmentIndex, 0);
                return {
                    id: `event-${department.slug}-${index + 1}`,
                    workspaceId,
                    departmentId: department.id,
                    projectId: `project-${department.slug}-${index + 1}`,
                    taskId: `task-${department.slug}-${index + 1}`,
                    title: `Focus: ${title}`,
                    description: `${department.name} focus block.`,
                    startAt,
                    endAt: new Date(
                        startAt.getTime() +
                            taskEstimates[index] * 60 * 1000,
                    ),
                    allDay: false,
                    location: index % 2 === 0 ? "Zoom" : "Meeting room A",
                    createdById: `user-${department.slug}-1`,
                    createdAt: localDay(-10, 10),
                    updatedAt: localDay(-1, 10),
                };
            }),
        ),
    );

    const notificationTypes = [
        "task_assigned",
        "task_due",
        "mention",
        "ai",
        "system",
    ] as const;

    await db.insert(notifications).values(
        departmentSeeds.flatMap((department, departmentIndex) =>
            department.tasks.map((title, index) => {
                const createdAt = localDay(
                    -(index + 1),
                    9 + (departmentIndex % 8),
                );
                return {
                    id: `notification-${department.slug}-${index + 1}`,
                    userId: `user-${department.slug}-${index + 1}`,
                    type: notificationTypes[index],
                    title:
                        index === 0
                            ? `New task: ${title}`
                            : index === 1
                              ? `Due soon: ${title}`
                              : index === 2
                                ? `Mentioned in ${title}`
                                : index === 3
                                  ? `AI plan ready for ${department.name}`
                                  : `Workspace update for ${department.name}`,
                    body: `${title} — ${department.name}.`,
                    entityType: "task",
                    entityId: `task-${department.slug}-${index + 1}`,
                    readAt:
                        index % 3 === 0
                            ? localDay(-(index + 1), 12)
                            : null,
                    createdAt,
                };
            }),
        ),
    );

    await db.insert(notifications).values(
        departmentSeeds.map((department, index) => ({
            id: `notification-demo-${index + 1}`,
            userId: demoUserId,
            type: notificationTypes[index],
            title:
                index === 0
                    ? "Welcome to TaskFlow AI"
                    : index === 1
                      ? `Weekly ${department.name} digest is ready`
                      : index === 2
                        ? `New mention in ${department.name}`
                        : index === 3
                          ? `AI plan ready for ${department.name}`
                          : `Workspace update for ${department.name}`,
            body: `${department.name} has fresh activity in TaskFlow HQ.`,
            entityType: "department",
            entityId: department.id,
            readAt: index === 0 ? new Date(Date.now() - 3_600_000) : null,
            createdAt: new Date(
                Date.now() - (index * 26 + 2) * 3_600_000,
            ),
        })),
    );

    await db.insert(aiConversations).values(
        departmentSeeds.map((department) => ({
            id: `ai-conversation-${department.slug}`,
            workspaceId,
            userId: `user-${department.slug}-1`,
            title: `${department.name} weekly planning`,
            model: "taskflow-rules-v1",
            createdAt: localDay(-5, 10),
            updatedAt: localDay(-1, 10),
        })),
    );

    await db.insert(aiMessages).values(
        departmentSeeds.flatMap((department) => [
            {
                id: `ai-message-${department.slug}-1`,
                conversationId: `ai-conversation-${department.slug}`,
                role: "system" as const,
                content:
                    "Ты — TaskFlow AI, помощник по планированию задач. Отвечай кратко, опирайся на данные рабочего пространства.",
                createdAt: localDay(-5, 10),
            },
            {
                id: `ai-message-${department.slug}-2`,
                conversationId: `ai-conversation-${department.slug}`,
                role: "user" as const,
                content: `Собери план на неделю для отдела ${department.name}.`,
                createdAt: localDay(-5, 10, 1),
            },
            {
                id: `ai-message-${department.slug}-3`,
                conversationId: `ai-conversation-${department.slug}`,
                role: "assistant" as const,
                content:
                    "План собран по правилам приоритета и дедлайнов. " +
                    "Сначала закрываем просроченные и срочные задачи, затем задачи с ближайшим сроком. " +
                    "Рекомендую оставить буфер 15 минут между блоками.",
                createdAt: localDay(-5, 10, 2),
            },
        ]),
    );

    const counts = {
        departments: departmentSeeds.length,
        users: userRows.length + 1,
        workspaces: 1,
        projects: projectRows.length,
        tasks: taskRows.length,
        comments: departmentSeeds.length * 5,
        calendarEvents: departmentSeeds.length * 5,
        notifications: departmentSeeds.length * 5 + 5,
        aiConversations: departmentSeeds.length,
    };

    console.log("Seed complete:", counts);
    console.log("Demo login: demo@taskflow.ai / Demo1234!");
    console.log("Team login: any seeded email / Password123!");
    sqlite.close();
}

main().catch((error) => {
    console.error("Seed failed:", error);
    sqlite.close();
    process.exit(1);
});
