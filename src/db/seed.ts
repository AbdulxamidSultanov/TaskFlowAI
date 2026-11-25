import bcrypt from "bcryptjs";

import { loadDatabaseEnvironment } from "./env";
import {
    aiConversations,
    aiMessages,
    aiPlanItems,
    aiPlans,
    aiTaskDrafts,
    authAttempts,
    calendarEvents,
    comments,
    departments,
    notifications,
    projects,
    reminderDeliveries,
    sessions,
    tags,
    taskActionRequests,
    taskActivity,
    taskAttachments,
    taskDependencies,
    taskParticipants,
    tasks,
    taskTags,
    timeEntries,
    userSettings,
    users,
    workspaceInvitations,
    workspaceMembers,
    workspaces,
} from "./schema";

const workspaceId = "ws-taskflow-hq";
const demoPassword = "Demo1234!";
const teamPassword = "Password123!";

const teams = {
    delivery: {
        id: "dept-product",
        slug: "delivery",
        name: "Управление проектами",
        description: "Требования, сроки и приёмка клиентских проектов.",
        color: "#0EA5E9",
    },
    engineering: {
        id: "dept-engineering",
        slug: "engineering",
        name: "Веб-разработка",
        description: "Frontend, backend и интеграции клиентских сайтов.",
        color: "#4F46E5",
    },
    design: {
        id: "dept-design",
        slug: "design",
        name: "UX/UI-дизайн",
        description: "Исследование сценариев, прототипы и адаптивные интерфейсы.",
        color: "#DB2777",
    },
    quality: {
        id: "dept-operations",
        slug: "quality",
        name: "QA и релизы",
        description: "Тестирование, среды разработки и выпуск обновлений.",
        color: "#059669",
    },
    clients: {
        id: "dept-marketing",
        slug: "client-service",
        name: "Клиентский сервис",
        description: "Онбординг, контент и поддержка после запуска.",
        color: "#D97706",
    },
};

type Team = keyof typeof teams;

type EmployeeSeed = Pick<typeof users.$inferInsert, "id" | "name" | "email" | "jobTitle"> & {
    team: Team;
    manager: string | null;
    scope: "self" | "team" | "workspace";
};

const staff = {
    founder: {
        id: "user-demo", name: "Шахзод Рахимов", email: "demo@taskflow.ai",
        jobTitle: "Основатель студии", team: "delivery", manager: null, scope: "workspace",
    },
    pm: {
        id: "user-product-1", name: "Малика Хамидова", email: "malika.khamidova@mayak.example",
        jobTitle: "Руководитель проектов", team: "delivery", manager: "founder", scope: "workspace",
    },
    techLead: {
        id: "user-engineering-1", name: "Тимур Алиев", email: "timur.aliev@mayak.example",
        jobTitle: "Технический руководитель", team: "engineering", manager: "founder", scope: "team",
    },
    backend: {
        id: "user-engineering-2", name: "Нодира Саидова", email: "nodira.saidova@mayak.example",
        jobTitle: "Backend-разработчик", team: "engineering", manager: "techLead", scope: "self",
    },
    frontend: {
        id: "user-engineering-3", name: "Артём Юлдашев", email: "artem.yuldashev@mayak.example",
        jobTitle: "Frontend-разработчик", team: "engineering", manager: "techLead", scope: "self",
    },
    fullstack: {
        id: "user-engineering-4", name: "Умид Мансуров", email: "umid.mansurov@mayak.example",
        jobTitle: "Full-stack-разработчик", team: "engineering", manager: "techLead", scope: "self",
    },
    designLead: {
        id: "user-design-1", name: "Сабина Мирзаева", email: "sabina.mirzaeva@mayak.example",
        jobTitle: "Руководитель дизайна", team: "design", manager: "founder", scope: "team",
    },
    designer: {
        id: "user-design-2", name: "Роман Ким", email: "roman.kim@mayak.example",
        jobTitle: "UX/UI-дизайнер", team: "design", manager: "designLead", scope: "self",
    },
    qaLead: {
        id: "user-operations-1", name: "Диёра Назарова", email: "diyora.nazarova@mayak.example",
        jobTitle: "QA-инженер и координатор релизов", team: "quality", manager: "founder", scope: "team",
    },
    devops: {
        id: "user-operations-2", name: "Антон Усманов", email: "anton.usmanov@mayak.example",
        jobTitle: "DevOps-инженер", team: "quality", manager: "qaLead", scope: "self",
    },
    account: {
        id: "user-marketing-1", name: "Зарина Алимова", email: "zarina.alimova@mayak.example",
        jobTitle: "Руководитель клиентского сервиса", team: "clients", manager: "founder", scope: "team",
    },
    content: {
        id: "user-marketing-2", name: "Мурод Азимов", email: "murod.azimov@mayak.example",
        jobTitle: "Контент-менеджер и специалист поддержки", team: "clients", manager: "account", scope: "self",
    },
} as const satisfies Record<string, EmployeeSeed>;

type Person = keyof typeof staff;

type TaskSeed = Pick<typeof tasks.$inferInsert, "title" | "description" | "status" | "priority" | "estimateMinutes"> & {
    id: string;
    assignee: Person;
    due: number;
    reviewer?: Person;
    blocker?: string;
    note?: string;
};

type ProjectSeed = Pick<typeof projects.$inferInsert, "name" | "key" | "description" | "status"> & {
    id: string;
    team: Team;
    owner: Person;
    due: number;
    tasks: TaskSeed[];
};

const portfolio: ProjectSeed[] = [
    {
        id: "project-engineering-1", key: "SEVER", name: "Личный кабинет «Север»",
        description: "Веб-кабинет для клиентов логистической компании с заявками и историей отправлений.",
        team: "engineering", owner: "techLead", due: 14,
        tasks: [
            {
                id: "task-engineering-1", title: "Добавить API истории отправлений",
                description: "Вернуть отправления текущей организации. Поддержать фильтры по статусу и периоду, а также постраничную выдачу.",
                assignee: "backend", status: "in_progress", priority: "high", estimateMinutes: 240, due: 0,
                note: "Контракт согласован, таблицу статусов подключаю к тестовому набору данных.",
            },
            {
                id: "task-engineering-2", title: "Сверстать таблицу отправлений",
                description: "Добавить состояния загрузки, пустой список и ошибки. Для узких экранов показать карточки.",
                assignee: "frontend", status: "in_progress", estimateMinutes: 240, due: 3,
            },
            {
                id: "task-engineering-3", title: "Проверить разделение данных организаций",
                description: "Покрыть тестами обращения к чужим отправлениям через список и карточку детали.",
                assignee: "backend", status: "under_review", reviewer: "techLead", estimateMinutes: 100, priority: "high", due: 1,
                note: "Тесты готовы. Проверьте сценарий пользователя, у которого есть доступ к двум организациям.",
            },
            {
                id: "task-engineering-4", title: "Уточнить форматы статусов перевозчика",
                description: "Сопоставить статусы партнёра со статусами кабинета и оформить таблицу маппинга.",
                assignee: "fullstack", status: "blocked", priority: "high", estimateMinutes: 90, due: -1,
                blocker: "Партнёр ещё не выдал тестовый ответ со статусами отмены и возврата.",
            },
            {
                id: "task-engineering-5", title: "Подготовить тестовые отправления",
                description: "Собрать набор для новых, доставленных и отменённых отправлений для проверки сценариев в кабинете.",
                assignee: "fullstack", status: "completed", estimateMinutes: 60, due: -2,
            },
            {
                id: "task-engineering-6", title: "Согласовать план подключения API партнёра",
                description: "Уточнить ограничения тестового контура и назначить день совместной проверки.",
                assignee: "techLead", estimateMinutes: 45, due: 0,
            },
        ],
    },
    {
        id: "project-engineering-2", key: "LIST", name: "Интернет-магазин «Лист»",
        description: "Каталог, корзина и оформление заказа для магазина комнатных растений.",
        team: "engineering", owner: "techLead", due: 21,
        tasks: [
            {
                id: "task-engineering-7", title: "Добавить фильтры каталога растений",
                description: "Сохранять выбранные фильтры в URL. Покрыть фильтры по освещению, размеру и наличию.",
                assignee: "frontend", status: "completed", estimateMinutes: 180, due: -3,
            },
            {
                id: "task-engineering-8", title: "Реализовать расчёт доставки в корзине",
                description: "Посчитать цену доставки по району и показать итоговую сумму до оформления.",
                assignee: "backend", estimateMinutes: 240, due: 6,
            },
            {
                id: "task-engineering-9", title: "Проверить восстановление корзины",
                description: "При повторном открытии сайта восстановить товары и обновить цены и остатки.",
                assignee: "fullstack", estimateMinutes: 120, due: 8,
            },
        ],
    },
    {
        id: "project-product-1", key: "MAYAK", name: "Сайт студии «Маяк»",
        description: "Портфолио, список услуг и форма заявки для новых клиентов.",
        team: "delivery", owner: "pm", due: 12,
        tasks: [
            {
                id: "task-product-1", title: "Утвердить структуру портфолио",
                description: "Согласовать порядок кейсов и список материалов для первых трёх карточек.",
                assignee: "founder", priority: "high", estimateMinutes: 45, due: 0,
            },
            {
                id: "task-product-2", title: "Согласовать требования к форме заявки",
                description: "Описать обязательные поля, согласие на обработку данных и подтверждение получения заявки.",
                assignee: "pm", status: "in_progress", estimateMinutes: 90, due: 1,
                note: "После ревью уточню сценарий отправки с вложением.",
            },
            {
                id: "task-product-3", title: "Составить график публикации кейсов",
                description: "Зафиксировать ответственных за тексты, скриншоты и согласование с заказчиками.",
                assignee: "pm", estimateMinutes: 60, due: 5,
            },
        ],
    },
    {
        id: "project-design-1", key: "UX", name: "Дизайн кабинета «Север»",
        description: "Адаптивные макеты личного кабинета, библиотека компонентов и передача в разработку.",
        team: "design", owner: "designLead", due: 9,
        tasks: [
            {
                id: "task-design-1", title: "Подготовить мобильные макеты заявки",
                description: "Показать этапы создания заявки и состояния ошибок ввода для экранов от 360 пикселей.",
                assignee: "designer", status: "in_progress", estimateMinutes: 150, due: 0,
            },
            {
                id: "task-design-2", title: "Проверить контраст статусов отправлений",
                description: "Сверить цветовые токены для выбранных состояний и добавить текстовые подписи к статусам.",
                assignee: "designLead", status: "completed", estimateMinutes: 75, due: -2,
            },
            {
                id: "task-design-3", title: "Подготовить спецификацию таблицы",
                description: "Зафиксировать размеры колонок, отображение длинных значений и доступное название кнопок.",
                assignee: "designer", status: "under_review", reviewer: "designLead", estimateMinutes: 90, due: 2,
                note: "В макете добавлены варианты пустого списка и ошибки сервера.",
            },
        ],
    },
    {
        id: "project-operations-1", key: "REL", name: "Подготовка пилота «Север»",
        description: "Тестовый контур, приёмочные проверки и сценарий возврата к предыдущей версии.",
        team: "quality", owner: "qaLead", due: 14,
        tasks: [
            {
                id: "task-operations-1", title: "Пройти основной сценарий отправления",
                description: "От создания заявки до отображения отправления в кабинете. Проверить сценарий роли клиента на мобильном и десктопе.",
                assignee: "qaLead", status: "in_progress", priority: "high", estimateMinutes: 150, due: 0,
            },
            {
                id: "task-operations-2", title: "Настроить тестовый контур кабинета",
                description: "Поднять тестовую базу и проверить выпуск preview-сборок из веток.",
                assignee: "devops", status: "completed", estimateMinutes: 180, due: -4,
            },
            {
                id: "task-operations-3", title: "Проверить процедуру отката релиза",
                description: "На тестовом контуре восстановить предыдущую сборку и проверить, что заявки остаются доступны.",
                assignee: "devops", priority: "high", estimateMinutes: 90, due: 6,
            },
        ],
    },
    {
        id: "project-marketing-1", key: "CARE", name: "Онбординг клиентов",
        description: "Инструкции для первых пользователей и обработка обратной связи после запуска.",
        team: "clients", owner: "account", due: 18,
        tasks: [
            {
                id: "task-marketing-1", title: "Собрать вопросы участников пилота",
                description: "Получить замечания по личному кабинету и согласовать срок ответа по каждому вопросу.",
                assignee: "account", status: "in_progress", estimateMinutes: 60, due: 0,
            },
            {
                id: "task-marketing-2", title: "Написать инструкцию по первой заявке",
                description: "Подготовить шаги со скриншотами для администратора клиентской организации.",
                assignee: "content", estimateMinutes: 120, due: 5,
            },
            {
                id: "task-marketing-3", title: "Подготовить шаблоны ответов поддержки",
                description: "Описать выдачу доступа, сброс пароля и дальнейшие действия, если статус отправления не меняется.",
                assignee: "content", status: "completed", estimateMinutes: 90, due: -1,
            },
        ],
    },
];

function day(offset: number, hour: number) {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
}

const meetings = [
    { id: "event-engineering-1", project: "project-engineering-1", host: "techLead", title: "Демо кабинета «Север»", offset: 0, hour: 15, minutes: 45 },
    { id: "event-design-1", project: "project-design-1", host: "designLead", title: "Ревью макетов заявки", offset: 1, hour: 11, minutes: 30 },
    { id: "event-product-1", project: "project-product-1", host: "pm", title: "Согласование портфолио студии", offset: 2, hour: 14, minutes: 30 },
    { id: "event-operations-1", project: "project-operations-1", host: "qaLead", title: "Репетиция пилотного релиза", offset: 4, hour: 16, minutes: 60 },
    { id: "event-marketing-1", project: "project-marketing-1", host: "account", title: "Встреча по обратной связи пилота", offset: 5, hour: 11, minutes: 45 },
] as const;

// Delete children first so the reset also works across migration versions with
// different ON DELETE behavior.
const resetTables = [
    aiTaskDrafts,
    aiMessages,
    aiConversations,
    aiPlanItems,
    aiPlans,
    calendarEvents,
    comments,
    notifications,
    reminderDeliveries,
    taskActionRequests,
    taskActivity,
    taskAttachments,
    taskDependencies,
    taskParticipants,
    taskTags,
    timeEntries,
    tags,
    tasks,
    projects,
    workspaceInvitations,
    workspaceMembers,
    sessions,
    userSettings,
    departments,
    workspaces,
    users,
];

async function main() {
    loadDatabaseEnvironment();
    const { client, db } = await import("./index");
    try {
        const [ownerHash, teamHash] = await Promise.all([
            bcrypt.hash(demoPassword, 10),
            bcrypt.hash(teamPassword, 10),
        ]);
        const createdAt = day(-14, 10);
        const updatedAt = day(-1, 15);
        const people = Object.values(staff);
        const departmentRows = Object.values(teams);
        const projectRows = portfolio.map(({ id, key, name, description, status, team, owner, due }) => ({
            id, key, name, description, status,
            workspaceId,
            departmentId: teams[team].id,
            color: teams[team].color,
            ownerId: staff[owner].id,
            startDate: createdAt,
            dueDate: day(due, 18),
            createdAt,
            updatedAt,
        }));
        const records = portfolio.flatMap((project) =>
            project.tasks.map(({ assignee, due, reviewer, blocker, note, ...task }, position) => {
                const assigneeId = staff[assignee].id;
                const reviewerId = reviewer ? staff[reviewer].id : null;
                const row = {
                    ...task,
                    workspaceId,
                    projectId: project.id,
                    departmentId: teams[project.team].id,
                    creatorId: staff[project.owner].id,
                    assigneeId,
                    reviewerId,
                    requiresReview: reviewerId !== null,
                    submittedAt: reviewerId ? updatedAt : null,
                    blockReason: blocker,
                    blockedAt: blocker ? updatedAt : null,
                    blockedById: blocker ? assigneeId : null,
                    startDate: day(-7, 9),
                    dueDate: day(due, 18),
                    position,
                    completedAt: task.status === "completed" ? day(due, 15) : null,
                    createdAt,
                    updatedAt,
                };
                return { row, note, tagId: `tag-${project.team}` };
            }),
        );
        const calendarRows = meetings.map(({ id, project, host, title, offset, hour, minutes }) => {
            const startAt = day(offset, hour);
            return {
                id,
                workspaceId,
                projectId: project,
                departmentId: teams[staff[host].team].id,
                createdById: staff[host].id,
                title,
                startAt,
                endAt: new Date(startAt.getTime() + minutes * 60_000),
                createdAt,
                updatedAt,
            };
        });

        console.log("Replacing TaskFlowAI data with the Mayak web studio demo...");
        await client.execute("PRAGMA foreign_keys = ON");
        await db.batch([
            db.delete(authAttempts),
            ...resetTables.map((table) => db.delete(table)),
            db.insert(departments).values(departmentRows.map((team) => ({
                ...team, createdAt, updatedAt,
            }))),
            db.insert(users).values(people.map<typeof users.$inferInsert>(({ team, scope, manager, ...person }) => ({
                ...person,
                departmentId: teams[team].id,
                role: manager === null ? "admin" : scope === "self" ? "member" : "manager",
                passwordHash: manager === null ? ownerHash : teamHash,
                createdAt,
                updatedAt,
            }))),
            db.insert(workspaces).values({
                id: workspaceId,
                name: "Веб-студия «Маяк»",
                slug: "mayak-web-studio",
                ownerId: staff.founder.id,
                plan: "business",
                createdAt,
                updatedAt,
            }),
            db.update(departments).set({ workspaceId }),
            db.insert(workspaceMembers).values(people.map<typeof workspaceMembers.$inferInsert>(({ id, manager, scope }) => ({
                workspaceId,
                userId: id,
                role: manager === null ? "owner" : "member",
                accessScope: scope,
                managerUserId: manager === null ? null : staff[manager].id,
                joinedAt: createdAt,
            }))),
            db.insert(userSettings).values(people.map(({ id }) => ({ userId: id, updatedAt }))),
            db.insert(projects).values(projectRows),
            db.insert(tags).values(Object.entries(teams).map(([team, details]) => ({
                id: `tag-${team}`,
                workspaceId,
                name: details.name,
                color: details.color,
                createdAt,
            }))),
            db.insert(tasks).values(records.map(({ row }) => row)),
            db.insert(taskTags).values(records.map(({ row, tagId }) => ({
                taskId: row.id, tagId,
            }))),
            db.insert(taskDependencies).values([
                { taskId: "task-engineering-1", dependsOnId: "task-engineering-5" },
                { taskId: "task-engineering-2", dependsOnId: "task-engineering-1" },
                { taskId: "task-operations-3", dependsOnId: "task-operations-2" },
            ]),
            db.insert(taskActivity).values(records.map(({ row }) => ({
                taskId: row.id, actorId: row.creatorId, action: "created", createdAt,
            }))),
            db.insert(comments).values(records.flatMap(({ row, note }) => note ? [{
                taskId: row.id, authorId: row.assigneeId, body: note, createdAt: updatedAt, updatedAt,
            }] : [])),
            db.insert(taskActionRequests).values(records.flatMap(({ row, note }) => row.reviewerId ? [{
                taskId: row.id,
                targetUserId: row.reviewerId,
                requestedById: row.assigneeId,
                kind: "review" as const,
                reason: note ?? "",
                createdAt: updatedAt,
            }] : [])),
            db.insert(notifications).values(records.filter(({ row }) => row.status !== "completed").map<typeof notifications.$inferInsert>(({ row }) => ({
                id: row.id.replace("task-", "notification-"),
                userId: row.assigneeId,
                type: "task_assigned",
                title: "Вам назначена задача",
                body: row.title,
                entityType: "task",
                entityId: row.id,
                createdAt,
            }))),
            db.insert(calendarEvents).values(calendarRows),
            db.insert(aiConversations).values({
                id: "ai-conversation-engineering",
                workspaceId,
                userId: staff.techLead.id,
                title: "Подготовка к демо кабинета «Север»",
                createdAt: updatedAt,
                updatedAt,
            }),
            db.insert(aiMessages).values([
                {
                    conversationId: "ai-conversation-engineering",
                    role: "user",
                    content: "Что показать на демо кабинета «Север»?",
                    createdAt: updatedAt,
                },
                {
                    conversationId: "ai-conversation-engineering",
                    role: "assistant",
                    content: "Покажите историю отправлений, фильтры и создание заявки. Для проверки ролевого доступа подготовьте двух пользователей из разных организаций.",
                    createdAt: new Date(updatedAt.getTime() + 1000),
                },
            ]),
        ]);
        const { rows: violations } = await client.execute("PRAGMA foreign_key_check");
        if (violations.length) throw new Error("Demo data failed the foreign key check");
        console.log(`Seeded ${people.length} accounts, ${departmentRows.length} departments, ${projectRows.length} projects and ${records.length} tasks.`);
        console.log(`Owner login: ${staff.founder.email} / ${demoPassword}`);
        console.log(`Team login: any account from docs/test-accounts.md / ${teamPassword}`);
    } finally {
        client.close();
    }
}

main().catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
});
