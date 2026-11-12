# TaskFlowAI — база данных и backend

Локальный backend для TaskFlowAI: SQLite + Drizzle ORM, REST API на Next.js Route Handlers, cookie-сессии и детерминированный seed.

## Стек

- **Next.js 16.4.2** — App Router, Route Handlers.
- **SQLite/libSQL** через `@libsql/client` (better-sqlite3 используется инструментами разработки) — файл `.data/taskflow.db`.
- **Drizzle ORM 0.45** — схема, запросы и миграции.
- **Zod 4** — валидация тела и query-параметров.
- **bcryptjs** — хеширование паролей.
- **HttpOnly cookie** `taskflow_session` — серверные сессии в таблице `sessions`.

## Быстрый старт

```bash
npm install
cp .env.example .env.local
npm run db:setup
npm run dev
```

`db:setup` применяет миграции из `drizzle/` и заново заполняет базу seed-данными.

Проверка:

```bash
curl http://localhost:3000/api/health
```

Ожидаемый ответ:

```json
{"data":{"status":"ok","database":"up","latencyMs":1,"timestamp":"..."}}
```

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run db:generate` | Генерирует новую SQL-миграцию по `src/db/schema.ts` |
| `npm run db:migrate` | Применяет миграции из `drizzle/` |
| `npm run db:push` | Синхронизирует схему напрямую (интерактивно, для разработки) |
| `npm run db:seed` | Очищает и заново заполняет базу |
| `npm run db:setup` | `db:migrate` + `db:seed` |
| `npm run db:reset` | Удаляет SQLite-файл, применяет миграции и seed |
| `npm run db:studio` | Drizzle Studio |
| `npm run typecheck` | `tsc --noEmit` |

## Переменные окружения

```env
DATABASE_URL=file:./.data/taskflow.db
```

Приложение, seed и миграции используют общий DATABASE_URL. Совместимый локальный DATABASE_PATH используется только если DATABASE_URL отсутствует; по умолчанию — `.data/taskflow.db`. Директория `.data/` добавлена в `.gitignore`. Скрипты `db:seed` и `drizzle-kit` читают `.env.local` автоматически.

## Демо-доступ

| Роль | Email | Пароль |
|---|---|---|
| Admin / owner рабочего пространства | `demo@taskflow.ai` | `Demo1234!` |
| Сотрудники отделов | например `aziz.karimov@taskflow.ai` | `Password123!` |

Всего seed создаёт **26 пользователей**: 1 демо-администратор и по 5 сотрудников в каждом из 5 отделов.

## Seed-данные

Отделы: **Engineering, Product, Design, Marketing, Operations**.

На каждый отдел создаётся по **5 записей**:

| Сущность | На отдел | Всего |
|---|---:|---:|
| Пользователи | 5 | 25 + demo |
| Проекты | 5 | 25 |
| Задачи | 5 | 25 |
| Комментарии | 5 | 25 |
| События календаря | 5 | 25 |
| Уведомления | 5 | 25 + 5 demo |
| AI-диалоги | 1 | 5 |

Дополнительно: 1 workspace `TaskFlow HQ`, 5 тегов, 25 связей задача–тег.

Seed использует фиксированные данные и относительные даты от текущего дня, поэтому его можно запускать повторно.

## Формат ответов

Успех:

```json
{"data": ...}
```

Список:

```json
{
  "data": {
    "items": [],
    "pagination": {"page": 1, "pageSize": 20, "total": 0, "pages": 1}
  }
}
```

Ошибка:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

Коды: `400`, `401`, `403`, `404`, `409`, `422`, `500`.

## Аутентификация

Пароль хранится как bcrypt-хеш. При логине создаётся подписанная HMAC cookie с userId, сроком, версией сессии и случайным nonce; в таблице sessions хранится SHA-256 хеш полной cookie. Сессия проверяется и может быть отозвана сервером. Смена пароля увеличивает sessionVersion. Cookie:

- `HttpOnly`
- `SameSite=Lax`
- `Secure` в production
- срок жизни 30 дней
- имя `taskflow_session`

Все приватные endpoints требуют cookie. Для запросов из браузера cookie отправляется автоматически; для curl используйте `-c/-b`.

```bash
curl -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"demo@taskflow.ai","password":"Demo1234!"}' \
  http://localhost:3000/api/auth/login

curl -b cookies.txt http://localhost:3000/api/auth/me
```

## Endpoints

### Служебные

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/health` | public | Проверка БД |

### Auth

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | public | Регистрация; создаёт сессию |
| POST | `/api/auth/login` | public | Вход |
| POST | `/api/auth/logout` | auth | Выход, удаление сессии |
| GET | `/api/auth/me` | auth | Текущий пользователь, настройки, workspace-членства |

`POST /api/auth/register`

```json
{
  "name": "New User",
  "email": "new@taskflow.ai",
  "password": "Password123!",
  "departmentId": "dept-engineering"
}
```

### Departments

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/departments` | auth | Список отделов + counts |
| POST | `/api/departments` | workspace owner/admin | Создать отдел |
| GET | `/api/departments/[id]` | auth | Отдел, участники, counts |
| PATCH | `/api/departments/[id]` | workspace owner/admin | Обновить |
| DELETE | `/api/departments/[id]` | workspace owner/admin | Удалить пустой отдел |

### Users

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/users` | auth | Список, фильтры `departmentId`, `role`, `search` |
| POST | `/api/users` | workspace owner/admin/team supervisor | Создать пользователя |
| GET | `/api/users/[id]` | self / admin / manager | Профиль, статистика, членства |
| PATCH | `/api/users/[id]` | self / admin | Обновить профиль; роль и отдел — admin |
| DELETE | `/api/users/[id]` | admin | Удалить пользователя |

### Workspaces

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/workspaces` | auth | Доступные workspace + counts |
| POST | `/api/workspaces` | admin/manager | Создать workspace |
| GET | `/api/workspaces/[id]` | member | Workspace, участники, проекты |
| PATCH | `/api/workspaces/[id]` | owner/admin | Обновить |
| DELETE | `/api/workspaces/[id]` | owner/admin | Удалить |
| GET | `/api/workspaces/[id]/members` | member | Участники |
| POST | `/api/workspaces/[id]/members` | owner/admin | Добавить участника |
| DELETE | `/api/workspaces/[id]/members?userId=...` | owner/admin | Удалить участника |

### Projects

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/projects` | auth | Фильтры `workspaceId`, `departmentId`, `status`, `search` |
| POST | `/api/projects` | workspace owner/admin/team supervisor | Создать |
| GET | `/api/projects/[id]` | workspace member | Проект + задачи |
| PATCH | `/api/projects/[id]` | workspace owner/admin | Обновить |
| DELETE | `/api/projects/[id]` | workspace owner/admin | Архивировать проект |

### Tasks

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/tasks` | auth | Список + фильтры + пагинация |
| POST | `/api/tasks` | workspace member | Создать |
| GET | `/api/tasks/[id]` | workspace member | Задача, теги, комментарии |
| PATCH | `/api/tasks/[id]` | workspace member | Обновить |
| DELETE | `/api/tasks/[id]` | writable task scope | Архивировать задачу |
| GET | `/api/tasks/[id]/comments` | workspace member | Комментарии |
| POST | `/api/tasks/[id]/comments` | workspace member | Добавить комментарий |

Фильтры `GET /api/tasks`:

`workspaceId`, `projectId`, `departmentId`, `assigneeId`, `parentTaskId`, `status`, `priority`, `search`, `due=overdue|today|week`, `page`, `pageSize`.

`POST /api/tasks`

```json
{
  "projectId": "project-engineering-1",
  "title": "Ship release notes",
  "description": "Prepare notes for the Friday release.",
  "status": "todo",
  "priority": "high",
  "assigneeId": "user-engineering-2",
  "dueDate": "2026-10-30T12:00:00.000Z",
  "estimateMinutes": 60,
  "tagIds": ["tag-engineering"]
}
```

При переводе задачи в `completed` автоматически заполняется `completedAt`.

### Calendar

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/calendar/events` | auth | Фильтры `workspaceId`, `departmentId`, `projectId`, `from`, `to` |
| POST | `/api/calendar/events` | workspace member | Создать событие |
| GET | `/api/calendar/events/[id]` | workspace member | Событие |
| PATCH | `/api/calendar/events/[id]` | workspace member | Обновить |
| DELETE | `/api/calendar/events/[id]` | workspace member | Удалить |

### Notifications

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/notifications` | auth | Только свои; `unread=true`, пагинация |
| POST | `/api/notifications` | admin/manager | Создать уведомление |
| PATCH | `/api/notifications/[id]` | owner/admin | Отметить прочитанным |
| DELETE | `/api/notifications/[id]` | owner/admin | Удалить |
| POST | `/api/notifications/read-all` | auth | Прочитать все |

### Analytics

`GET /api/analytics/overview?workspaceId=...&departmentId=...&from=...&to=...`

Возвращает:

- `totals`: задачи, завершённые, открытые, просроченные, completion rate;
- `byStatus`;
- `byPriority`;
- `byDepartment`;
- `upcoming` — ближайшие открытые задачи;
- `recentlyCompleted` — завершённые за 7 дней.

### AI Assistant

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/ai/conversations` | auth | Свои диалоги, опционально `workspaceId` |
| POST | `/api/ai/conversations` | workspace member | Создать диалог |
| GET | `/api/ai/conversations/[id]/messages` | workspace member | Сообщения |
| POST | `/api/ai/conversations/[id]/messages` | workspace member | Отправить сообщение и получить ответ |
| GET | `/api/ai/plan` | auth | Последние 10 планов |
| POST | `/api/ai/plan` | workspace member | Сгенерировать план дня |

`POST /api/ai/plan`

```json
{
  "workspaceId": "ws-taskflow-hq",
  "date": "2026-10-24T09:00:00.000Z",
  "availableMinutes": 240
}
```

Планировщик **детерминированный, без внешнего LLM**: сортирует открытые задачи по приоритету и дедлайну, режет день на блоки с оценкой времени и буфером 10 минут. Если назначенных задач нет, чужие задачи не подставляются. Ответ ассистента в чате также строится по правилам и статистике задач. Это позволяет backend работать без `OPENAI_API_KEY`; провайдер LLM можно добавить позже, не меняя API.

### Settings

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/settings` | auth | Настройки текущего пользователя |
| PATCH | `/api/settings` | auth | Обновить тему, язык, уведомления, AI-модель |

### Tags

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/tags?workspaceId=...` | workspace member | Теги workspace |
| POST | `/api/tags` | workspace member | Создать тег |

## Структура БД

Основные таблицы:

- `departments` — отделы;
- `users`, `user_settings`, `sessions`;
- `workspaces`, `workspace_members`;
- `projects`, `tasks` (самоподобные подзадачи через `parent_task_id`);
- `tags`, `task_tags`;
- `comments`;
- `calendar_events`;
- `notifications`;
- `ai_conversations`, `ai_messages`, `ai_plans`, `ai_plan_items`.

Схема: `src/db/schema.ts`. Клиент: `src/db/index.ts`. Миграции: `drizzle/`.

## Ограничения и production

- SQLite подходит для локальной разработки, демо и одного инстанса. На Vercel/serverless файл `.data/taskflow.db` не является постоянным хранилищем.
- Runtime и CLI уже поддерживают SQLite/libSQL/Turso через общий DATABASE_URL. Перед удалёнными миграциями нужна резервная копия провайдера и CONFIRM_REMOTE_MIGRATION=1; удалённое развёртывание в этой среде не проверялось.
- Демо-пароли нельзя использовать в production.
- Auth имеет ограничение 20 попыток на нормализованный email за 15 минут. Мутации проверяют Origin, cookie имеет SameSite=Lax; для внешнего HTTPS-origin задайте APP_ORIGINS. Это не заменяет инфраструктурную защиту от распределённого перебора по разным email.
- `GET /api/health` публичный, не содержит секретов.

## Расширения от 12 ноября 2026

Дополнены `workspace_members` (руководитель/scope), `tasks` (архив), `user_settings` (напоминания), `ai_task_drafts` (метаданные подтверждения), `users` (версия сессий), `departments` (workspace). Добавлены time_entries, task_activity, task_dependencies, reminder_deliveries, auth_attempts, task_attachments, workspace_invitations и ограничения целостности SQL.

AI-публикация разрешена автору черновика либо администратору workspace, с повторной проверкой области доступа. Обычные CRUD задач транзакционны; циклы подзадач запрещены. Справочники и аналитика ограничены scope пользователя.

Полное описание новых маршрутов: [time-management.md](time-management.md).
