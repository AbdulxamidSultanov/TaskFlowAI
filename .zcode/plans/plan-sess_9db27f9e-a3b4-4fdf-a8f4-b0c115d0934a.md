# План: аудит TaskFlowAI — исполнение (с правками пользователя)

## Context

Задача: проверить весь код, запустить тестовый прогон, описать ошибки (решения за вами), переписать AGENTS.md. По вашим правкам: **исправить** только (1) зависимость zod, (2) npm-скрипты под Windows, (3) добавить горячую клавишу Ctrl+K. **Не трогать**: better-sqlite3 (вероятно соберётся при наличии Python), SidebarItem.tsx, docs/backend.md — их только описываю в отчёте.

Уже готово: typecheck/lint — 0 ошибок; i18n-ключи en/ru/uz синхронны; зависимости установлены (`--ignore-scripts`, т.к. better-sqlite3 не собрался без Python); бэкенд и фронтенд прочитаны, список находок собран.

## Шаг 1. Три разрешённых изменения кода

1. **zod → в dependencies** (`package.json`): `npm install zod@^4.6.7 --ignore-scripts` (версия = текущая транзитивная, на ней прошёл typecheck). Починяет фантомную зависимость: `zod` импортируется напрямую в `src/lib/api/http.ts`, `src/lib/api/schemas.ts`, `src/lib/ai/task-generator.ts`.
2. **npm-скрипты под Windows** (`package.json`): заменить Unix-команды на кроссплатформенные node-однострочники:
   - `db:migrate` / `db:push`: `mkdir -p .data` → `node -e "require('fs').mkdirSync('.data',{recursive:true})"`
   - `db:reset`: `rm -f …` → `node -e "…fs.rmSync('.data/'+f,{force:true})"` для `taskflow.db`, `-shm`, `-wal`
3. **Горячая клавиша Ctrl+K** (`src/components/layout/app-header.tsx`): `useRef` на десктопный поиск + глобальный `keydown`-листенер: `(ctrlKey||metaKey) && key==="k"` → `preventDefault()`, фокус и выделение в поле поиска; на узких экранах (`< md`) — открыть мобильный поиск (`setMobileSearch(true)`). Стиль кода — как соседние useEffect (стр. 85–103). Подсказка `Ctrl K` из декоративной станет рабочей.

Проверка изменений: `npm run typecheck` и `npm run lint` — должны остаться 0 ошибок.

## Шаг 2. Тестовый прогон (код проекта больше не меняется)

`.env.local` указывает на удалённый Turso — все запуски с переопределением `DATABASE_URL=file:.data/test-run.db` (env shell приоритетнее .env.local), чтобы не трогать боевые данные:

1. Миграции на чистую БД helper-скриптом `C:\Users\Thuderobot\.zcode-tools\apply-drizzle-migrations.cjs` (вне проекта; `drizzle-kit migrate` не сработает — его better-sqlite3 не собран).
2. Seed: `DATABASE_URL=file:.data/test-run.db npm run db:seed`.
3. Dev-сервер: `DATABASE_URL=file:.data/test-run.db AI_MOCK=1 npm run dev` (фон).
4. Smoke-тесты curl: health → register → login demo → me → tasks CRUD + comments → projects → calendar → notifications + read-all → analytics → `POST /api/ai/plan` → AI-генератор в mock-режиме (генерация → PATCH → publish, без расхода квоты Gemini) → негативные кейсы (401/403/422).
5. Проверить страницы `/ru/login`, `/ru/dashboard` и др. — 200/307, без ошибок компиляции в логе.
6. После прогона удалить `.data/test-run.db*`.

## Шаг 3. AGENTS.md (второе и последнее изменение файла)

На английском, с сохранением обоих авто-блоков Next.js (`nextjs-agent-rules`, `nextjs-agent-feedback` — их пишет/восстанавливает `next dev`). Добавить: назначение проекта, стек, карту архитектуры (api → http.ts envelope → auth guards → schema; AI-слой planner/generator + mock; RTK Query + sessionStorage; i18n), команды (с предупреждением про Turso в `.env.local` и переопределением `DATABASE_URL`), demo-аккаунты, инварианты Next 16 (proxy.ts вместо middleware, Promise-params, `connection()`, роли user vs workspace), указатели на docs/.

## Шаг 4. Отчёт об ошибках (в чат)

Полный список находок с путями `файл:строка`, включая не исправленные по вашему решению: better-sqlite3 (не собирается без Python; в `src/` не используется — вероятно, нужен только drizzle-kit'у), SidebarItem.tsx (мёртвый компонент с латентным багом pathname), docs/backend.md (устарел: better-sqlite3/таблица sessions вместо libsql/HMAC-cookie), мелочи (login без rate-limit, register без транзакции, LIKE без экранирования `%`/`_`, parentTaskId без FK и т.д.) + результаты smoke-прогона. Код, кроме 3 пунктов из Шага 1 и AGENTS.md, не меняется; git commit не делаю.

## Шаг 5. Отчётная процедура Next.js

По инструкции AGENTS.md: `npx --no-install next internal agent-feedback-instructions` из корня, следовать выводу (кандидаты: фантомная зависимость zod; нативные deps на Windows без Python). Без путей/секретов проекта.

## Verification

- typecheck + lint: 0 ошибок после правок.
- Smoke-тесты: ожидаемые статусы (200/201/204/401/403/409/422) зафиксированы; сервер без ошибок в логе.
- Ctrl+K: проверить в браузере на странице задач — фокус в поиске.
- `git status`: ровно 3 изменённых файла — `package.json`, `package-lock.json`, `src/components/layout/app-header.tsx`, `AGENTS.md`.
