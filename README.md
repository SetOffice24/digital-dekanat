# Цифровой деканат будущего

Прототип личного кабинета студента — **концепт для конкурса**, не официальный сервис какого-либо вуза.
Все данные вымышленные. Вуз — вымышленный «Универ».

## Что внутри
- **Студент:** «Сегодня» (следующая пара с отсчётом, дела, переносы), расписание (день/неделя, изменения, экспорт в календарь), учёба (сводка «как у меня дела», семестры, сессия, пересдачи), заявки и справки (мастер, трекер статуса, PDF с QR и страница проверки), уведомления и объявления, ИИ-помощник, чек-ин самочувствия, тёмная тема.
- **Сотрудник деканата:** сводка, обработка заявок и выдача справок, объявления, переносы и отмены пар — студенты сразу получают уведомления.

Тестовые аккаунты — [docs/test-accounts.md](docs/test-accounts.md). Архитектура — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Стек
Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · PostgreSQL 16 + Prisma 6 · argon2id · pdf-lib + QR · Docker Compose + Caddy (HTTPS).

## Безопасность
- Пароли — только хэш argon2id; ограничение попыток входа; сессии в БД, cookie `httpOnly`/`Secure`/`SameSite=Lax`.
- Данные студента читаются только через `src/server/repos/student.ts` с фильтром по студенту из сессии; чужая заявка/справка — 404. Проверено тестами (`tests/authz.test.ts`).
- Ключи (ИИ, БД) — только в `.env` на сервере; браузер обращается к ИИ через наш `/api/assistant`.

## Локальный запуск (Windows)
```bash
corepack pnpm install
cp .env.example .env
corepack pnpm db:local      # встроенный PostgreSQL на :5433 (держать открытым)
corepack pnpm prisma migrate deploy
corepack pnpm db:seed
corepack pnpm dev           # http://localhost:3000
```
Проверки: `corepack pnpm check` (типы, линтер, тесты).

## Деплой
`deploy/` — Docker Compose (app + postgres + caddy). На сервере: заполнить `deploy/.env` по `deploy/.env.example`, затем `./deploy/deploy.sh --seed`.
