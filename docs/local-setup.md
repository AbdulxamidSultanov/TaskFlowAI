# Локальный запуск TaskFlowAI

Инструкция для запуска проекта на своей машине. Для работы нужны Node.js и npm.

## Требования

- Node.js 20 или новее (рекомендуется 22)
- npm 10+
- Git

## 1. Клонирование

```bash
git clone https://github.com/AbdulxamidSultanov/TaskFlowAI.git
cd TaskFlowAI
git checkout develop
```

## 2. Установка зависимостей

```bash
npm install
```

## 3. Переменные окружения

```bash
cp .env.example .env.local
```

Для локальной файловой базы дополнительные переменные не нужны. При желании задайте
свой секрет для подписи сессионных cookie:

```env
AUTH_SECRET=любая-длинная-случайная-строка
```

Сгенерировать секрет:

```bash
openssl rand -hex 32
```

## 4. База данных

```bash
npm run db:setup
```

Команда применяет миграции из `drizzle/` и засеивает демо-данные: отделы, сотрудников,
проекты, задачи, комментарии, события календаря и уведомления.

Локальная база создаётся в `.data/taskflow.db` и не попадает в Git.

Сбросить базу и засеять заново:

```bash
npm run db:reset
```

## 5. Запуск

```bash
npm run dev -- --port 3000
```

Откройте [http://localhost:3000](http://localhost:3000). Корень сразу перенаправит на
страницу входа, а после авторизации — на dashboard.

## Демо-доступ

| Роль | Email | Пароль |
|---|---|---|
| Администратор / владелец workspace | `demo@taskflow.ai` | `Demo1234!` |
| Сотрудники отделов | например, `aziz.karimov@taskflow.ai` | `Password123!` |

## Полезные команды

```bash
npm run dev            # dev-сервер
npm run build          # production-сборка
npm run start          # запуск production-сборки
npm run lint           # ESLint
npm run typecheck      # проверка TypeScript
npm run db:generate    # миграция из изменений схемы
npm run db:migrate     # применить миграции
npm run db:seed        # пересоздать демо-данные
npm run db:studio      # Drizzle Studio
```

## Подключение удалённой Turso-базы (опционально)

Локально можно работать не с файлом, а с удалённой libSQL/Turso-базой:

```env
DATABASE_URL=libsql://<database>-<account>.turso.io
DATABASE_AUTH_TOKEN=<token>
```

Схему и демо-данные нужно применить к этой базе отдельно. Для Vercel эти же переменные
добавляются в настройки проекта.

## Проверка перед коммитом

```bash
npm run typecheck
npm run lint
npm run build
```

## Частые проблемы

### Порт 3000 занят

```bash
npm run dev -- --port 3001
```

### После `npm run build` dev-сервер ведёт себя странно

Остановите dev-сервер, удалите `.next` и запустите снова:

```bash
rm -rf .next
npm run dev -- --port 3000
```

### База повреждена или нужна чистая

```bash
npm run db:reset
```

### Не работает вход после смены `AUTH_SECRET`

Старые cookie подписаны прежним секретом. Очистите cookie сайта или войдите в другом
приватном окне.

## Структура окружения

- `.env.local` — локальные секреты, в Git не попадает.
- `.env.example` — шаблон переменных.
- `.data/` — локальная SQLite-база, в Git не попадает.
- `drizzle/` — SQL-миграции, коммитятся в репозиторий.
