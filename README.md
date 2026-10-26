# TaskFlowAI

Task management workspace with projects, tasks, calendar, analytics, notifications and an AI planning assistant.

## Stack

- Next.js 16 (App Router, Route Handlers)
- React 19, TypeScript, Tailwind CSS 4
- next-intl (`ru`, `uz`, `en`)
- SQLite + Drizzle ORM + `better-sqlite3`
- Zod validation, bcrypt password hashing, HttpOnly cookie sessions
- Redux Toolkit + RTK Query
- Redux state persisted in `sessionStorage` until the tab is closed

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`db:setup` applies migrations from `drizzle/` and seeds demo data: 5 departments with
5 users, projects, tasks, comments, calendar events and notifications per department.

## Demo login

| Role | Email | Password |
|---|---|---|
| Admin / workspace owner | `demo@taskflow.ai` | `Demo1234!` |
| Department employees | e.g. `aziz.karimov@taskflow.ai` | `Password123!` |

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck

npm run db:generate   # generate migration from src/db/schema.ts
npm run db:migrate    # apply migrations
npm run db:seed       # reset + seed demo data
npm run db:setup      # migrate + seed
npm run db:reset      # delete SQLite file, migrate + seed
npm run db:studio     # Drizzle Studio
```

The local database lives in `.data/taskflow.db` and is gitignored. Override the path with
`DATABASE_PATH` (see `.env.example`). If the API is hosted on a different origin, set
`NEXT_PUBLIC_API_URL` (for example, `https://api.example.com/api`).

## Backend

REST API is implemented with Next.js Route Handlers under `src/app/api`:

- `/api/health`
- `/api/auth/*` — register, login, logout, me
- `/api/departments`, `/api/users`
- `/api/workspaces`, `/api/workspaces/[id]/members`
- `/api/projects`, `/api/tasks`, `/api/tasks/[id]/comments`
- `/api/calendar/events`, `/api/notifications`, `/api/settings`, `/api/tags`
- `/api/analytics/overview`
- `/api/ai/conversations`, `/api/ai/plan`

Full endpoint documentation, request examples and production notes:
[`docs/backend.md`](docs/backend.md).

Client API and Redux setup guide: [`docs/api-guide.md`](docs/api-guide.md).

Ready-to-copy HTTP examples for every endpoint: [`api-examples.txt`](api-examples.txt).

The AI assistant is deterministic and rule-based, so the backend works without an external
LLM key. It ranks open tasks by priority and due date and builds a day plan with time blocks.

## Redux Toolkit / RTK Query

The store is created in `src/lib/redux/store.ts` and provided by
`src/components/providers.tsx`. API hooks live in `src/lib/redux/api.ts`.

- RTK Query sends HttpOnly session cookies automatically (`credentials: "include"`).
- API cache and other Redux state are stored in `sessionStorage` under
  `taskflowai:redux-state`.
- The snapshot survives page reloads in the current tab and is removed when the tab is
  closed (or explicitly after logout).
- Use `useAppDispatch`, `useAppSelector`, and `useAppStore` from
  `src/lib/redux/hooks.ts` in client components.

## Project structure

```text
src/
  app/
    [locale]/          # localized UI
    api/               # REST route handlers
  db/
    schema.ts          # Drizzle schema
    index.ts           # SQLite/Drizzle client
    seed.ts            # demo data
  lib/
    api/               # HTTP helpers, validation, pagination
    auth/              # sessions, password hashing, guards
    services/          # task business logic
    ai/                # rule-based planner
    redux/             # store, RTK Query API, types, persistence
drizzle/               # SQL migrations
api-examples.txt       # copy-ready API calls for every endpoint
docs/backend.md        # backend documentation
docs/api-guide.md      # Redux / RTK Query / API usage guide
```
