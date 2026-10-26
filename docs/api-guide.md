# TaskFlowAI — гайд по API и Redux Toolkit / RTK Query

Документ для frontend-конфигурации: как устроен клиент API, как делать запросы из React, как работает локальное сохранение и как добавить новый endpoint.

Полный список HTTP-маршрутов и curl-примеры:

- `docs/backend.md` — описание backend;
- `api-examples.txt` — готовые примеры вызовов для каждого endpoint.

## 1. Что подключено

Установлены и настроены:

- `@reduxjs/toolkit`;
- `react-redux`;
- RTK Query (`@reduxjs/toolkit/query/react`);
- сохранение Redux-состояния в `sessionStorage`.

Основные файлы:

```text
src/lib/redux/
  api.ts          # createApi, baseQuery, endpoints и hooks
  types.ts        # клиентские типы запросов/ответов
  store.ts        # makeStore, RootState, AppDispatch
  hooks.ts        # useAppDispatch, useAppSelector, useAppStore
  persistence.ts  # sessionStorage: load/save/clear
  index.ts        # удобный реэкспорт

src/components/providers.tsx  # <Provider store={store}>
```

`Providers` уже подключён в `src/app/[locale]/layout.tsx`, поэтому Redux доступен всем клиентским компонентам приложения.

## 2. Локальное сохранение до закрытия вкладки

Используется **`sessionStorage`**, а не `localStorage`.

Почему:

- данные переживают перезагрузку страницы (F5) в текущей вкладке;
- браузер автоматически удаляет их после закрытия вкладки/окна;
- данные не попадают в другую вкладку.

Ключ хранения:

```text
taskflowai:redux-state
```

Что сохраняется:

- кэш RTK Query (пользователь, workspace, задачи, проекты, календарь и т.д.);
- остальные Redux-слайсы, если вы добавите их в `makeStore`.

Как это работает:

1. `makeStore()` вызывает `loadPersistedState()` и передаёт сохранённое состояние в `preloadedState`.
2. `startStatePersistence(store)` подписывается на изменения store.
3. Изменения сохраняются с небольшой задержкой (180 мс), чтобы не писать в storage на каждый action.
4. При `pagehide` состояние сохраняется сразу.
5. Если `sessionStorage` переполнен, приложение не падает: snapshot удаляется, в dev-режиме выводится предупреждение.
6. При выходе через `useLogoutMutation` кэш RTK Query сбрасывается, а сохранённый snapshot удаляется.

Проверить в DevTools:

```js
sessionStorage.getItem("taskflowai:redux-state")
```

Очистить вручную:

```js
sessionStorage.removeItem("taskflowai:redux-state")
```

Важно: cookie-сессия backend (`taskflow_session`) — это отдельный механизм. Она HttpOnly и не хранится в Redux. Redux хранит только клиентские данные и кэш ответов.

## 3. Базовый URL API

`src/lib/redux/api.ts` использует:

- `NEXT_PUBLIC_API_URL`, если переменная задана;
- иначе в браузере — `/api` (same-origin);
- иначе на сервере — `http://localhost:3000/api`.

Переменная окружения (необязательно):

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

Обычно её задавать не нужно: frontend и API работают на одном origin.

`fetchBaseQuery` уже настроен с:

```ts
credentials: "include"
```

Поэтому cookie `taskflow_session` отправляется автоматически. JWT/token в headers не нужен.

## 4. Как делать запросы из компонента

Используйте готовые hooks из `src/lib/redux/api.ts`.

### 4.1. Текущий пользователь

```tsx
"use client";

import {useGetMeQuery} from "@/lib/redux/api";

export function CurrentUser() {
    const {data, isLoading, isError} = useGetMeQuery();

    if (isLoading) return <span>Loading...</span>;
    if (isError || !data) return <span>Not signed in</span>;

    return <span>{data.user.name}</span>;
}
```

`data` имеет тип `MeResponse`:

```ts
{
    user: AuthUser;
    settings: UserSettings;
    memberships: Membership[];
}
```

### 4.2. Список задач

```tsx
"use client";

import {useGetTasksQuery} from "@/lib/redux/api";

export function TaskList() {
    const {data, isLoading, isFetching, refetch} = useGetTasksQuery({
        workspaceId: "ws-taskflow-hq",
        status: "in_progress",
        page: 1,
        pageSize: 20,
    });

    if (isLoading) return <p>Loading...</p>;

    return (
        <div>
            <button onClick={() => refetch()} disabled={isFetching}>
                Refresh
            </button>

            {data?.items.map((task) => (
                <div key={task.id}>{task.title}</div>
            ))}
        </div>
    );
}
```

`data` имеет тип `Paginated<TaskListItem>`:

```ts
{
    items: TaskListItem[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        pages: number;
    };
}
```

### 4.3. Создание задачи

```tsx
"use client";

import {useCreateTaskMutation} from "@/lib/redux/api";

export function CreateTaskButton() {
    const [createTask, {isLoading, error}] = useCreateTaskMutation();

    const onClick = async () => {
        try {
            const task = await createTask({
                projectId: "project-engineering-1",
                title: "Новая задача",
                description: "Создана из RTK Query",
                priority: "high",
                assigneeId: "user-engineering-2",
                dueDate: "2026-10-30T12:00:00.000Z",
                tagIds: ["tag-engineering"],
            }).unwrap();

            console.log(task);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <button onClick={onClick} disabled={isLoading}>
            Create task
        </button>
    );
}
```

После успешной мутации RTK Query автоматически инвалидирует теги `Task`, `Project`, `Analytics`, `Notification`, поэтому связанные запросы перезагрузятся.

### 4.4. Вход и выход

```tsx
"use client";

import {
    useLoginMutation,
    useLogoutMutation,
} from "@/lib/redux/api";

export function AuthButtons() {
    const [login] = useLoginMutation();
    const [logout] = useLogoutMutation();

    return (
        <div>
            <button
                onClick={() =>
                    login({
                        email: "demo@taskflow.ai",
                        password: "Demo1234!",
                    })
                }
            >
                Login
            </button>

            <button onClick={() => logout()}>
                Logout
            </button>
        </div>
    );
}
```

`useLogoutMutation` при успехе:

- сбрасывает кэш RTK Query;
- очищает `sessionStorage` snapshot.

### 4.5. Redux hooks

```tsx
import {
    useAppDispatch,
    useAppSelector,
    useAppStore,
} from "@/lib/redux/hooks";

const dispatch = useAppDispatch();
const state = useAppSelector((state) => state.taskflowApi);
const store = useAppStore();
```

Типы `RootState`, `AppDispatch`, `AppStore` лежат в `src/lib/redux/store.ts`.

## 5. Теги и инвалидация кэша

В `createApi` объявлены теги:

```text
Me, Department, User, Workspace, WorkspaceMember, Project, Task,
Comment, CalendarEvent, Notification, Tag, Analytics,
AiConversation, AiMessage, AiPlan, Settings
```

Мутации возвращают `invalidatesTags`, поэтому после изменения данных:

- список задач обновится после `createTask`, `updateTask`, `deleteTask`;
- проекты и аналитика обновятся после изменений задач;
- уведомления обновятся после действий, которые их создают;
- настройки обновятся после `updateSettings`.

Если добавляете новый endpoint, выбирайте существующий тег или добавьте новый в массив `tagTypes`.

## 6. Как добавить новый endpoint

Пример: нужен endpoint `GET /api/tasks/:id/activity`. Допустим, backend уже существует.

1. Добавьте тип в `src/lib/redux/types.ts`:

```ts
export type TaskActivity = {
    id: string;
    action: string;
    createdAt: IsoDateString;
};
```

2. Добавьте endpoint в `src/lib/redux/api.ts` внутри `endpoints`:

```ts
getTaskActivity: builder.query<TaskActivity[], {taskId: string}>({
    query: ({taskId}) =>
        `${entityPath("/tasks", taskId)}/activity`,
    transformResponse: (response) =>
        unwrap<TaskActivity[]>(response),
    providesTags: ["Task"],
}),
```

3. Экспортируйте hook в конце файла:

```ts
export const {
    // ...
    useGetTaskActivityQuery,
} = taskflowApi;
```

4. Используйте:

```tsx
const {data} = useGetTaskActivityQuery({taskId: "task-engineering-1"});
```

Если API возвращает `204 No Content`, тип результата — `void`, `transformResponse` не нужен.

## 7. HTTP-вызовы без RTK Query

Иногда нужно вызвать API вне React (например, в утилите или при отладке). Используйте обычный `fetch` с `credentials: "include"`.

```ts
const response = await fetch("/api/tasks?pageSize=10", {
    credentials: "include",
    headers: {
        accept: "application/json",
    },
});

const json = await response.json();

if (!response.ok) {
    throw new Error(json.error?.message ?? "Request failed");
}

console.log(json.data);
```

### Авторизация через curl

```bash
export BASE_URL=http://localhost:3000
export COOKIE_JAR=/tmp/taskflow-cookies.txt

curl -s -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -d '{"email":"demo@taskflow.ai","password":"Demo1234!"}' \
  "$BASE_URL/api/auth/login"

curl -s -b "$COOKIE_JAR" \
  "$BASE_URL/api/tasks?pageSize=5"
```

Все curl-примеры: `api-examples.txt`.

## 8. Формат запросов и ошибок

Успешный ответ:

```json
{"data": {}}
```

Список:

```json
{
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "pages": 1
    }
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

HTTP-коды:

- `400` — неверные данные/связи;
- `401` — нет сессии;
- `403` — нет доступа;
- `404` — объект не найден;
- `409` — конфликт (email, ключ проекта, занятый отдел);
- `422` — ошибка валидации;
- `500` — серверная ошибка.

В RTK Query ошибка приходит в `error`:

```tsx
const {error} = useGetTasksQuery();

if (error && "data" in error) {
    console.error(error.data);
}
```

Для более строгой типизации можно добавить `FetchBaseQueryError` из `@reduxjs/toolkit/query`.

## 9. Карта основных endpoint-ов

| Группа | Методы |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Departments | `GET/POST /api/departments`, `GET/PATCH/DELETE /api/departments/:id` |
| Users | `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` |
| Workspaces | `GET/POST /api/workspaces`, `GET/PATCH/DELETE /api/workspaces/:id` |
| Workspace members | `GET/POST/DELETE /api/workspaces/:id/members` |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` |
| Tasks | `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id` |
| Comments | `GET/POST /api/tasks/:id/comments` |
| Calendar | `GET/POST /api/calendar/events`, `GET/PATCH/DELETE /api/calendar/events/:id` |
| Notifications | `GET/POST /api/notifications`, `PATCH/DELETE /api/notifications/:id`, `POST /api/notifications/read-all` |
| Tags | `GET/POST /api/tags` |
| Analytics | `GET /api/analytics/overview` |
| AI | `GET/POST /api/ai/conversations`, `GET/POST /api/ai/conversations/:id/messages`, `GET/POST /api/ai/plan` |
| Settings | `GET/PATCH /api/settings` |

## 10. Отладка

- **401 Unauthorized** — сначала выполните login, затем повторите запрос; в браузере cookie отправится автоматически.
- **403 Forbidden** — пользователь не состоит в workspace или не имеет роли.
- **409 Conflict** — проверьте уникальность email, slug отдела, ключа проекта.
- **Данные не обновились после мутации** — проверьте `invalidatesTags` у mutation и `providesTags` у query.
- **Кэш странно ведёт себя после изменения схемы API** — очистите `sessionStorage`:

```js
sessionStorage.removeItem("taskflowai:redux-state");
location.reload();
```

- **Запросы уходят не туда** — проверьте `NEXT_PUBLIC_API_URL`; для локальной разработки обычно не нужен.
- **Нужно посмотреть store** — установите Redux DevTools; в development `devTools` включён.

В development store и API также доступны из консоли браузера:

```js
window.__TASKFLOW_STORE__.getState();
window.__TASKFLOW_API__.endpoints.health.initiate();
```

Эти глобальные переменные не создаются в production-сборке.

## 11. Правила безопасности

- Не сохраняйте пароли, токены и персональные секреты в Redux/sessionStorage.
- Backend использует HttpOnly cookie, поэтому frontend не должен читать или дублировать session token.
- При выходе вызывайте `useLogoutMutation`, чтобы очистить кэш и snapshot.
- `sessionStorage` очищается при закрытии вкладки, но не является защищённым хранилищем от XSS. Не кладите туда чувствительные данные.
- Для production с отдельным доменом API настройте CORS и передавайте `credentials: "include"`.
