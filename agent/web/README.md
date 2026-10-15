# Веб-прототип тренера — инструкция

Веб-чат к агенту из `~/Documents/agent`: Next.js + Supabase. Для разработки через Claude Code — `CLAUDE.md` (правила) и `ROADMAP.md` (план).

## Как продолжать разработку в Claude Code

1. Положить `web/` рядом с агентом (`~/Documents/agent/web`) — см. «Обновить код» ниже.
2. Один раз создать `~/Documents/agent/CLAUDE.md` с одной строкой — чтобы Claude Code сразу видел правила проекта:
   ```bash
   echo '@web/CLAUDE.md' > ~/Documents/agent/CLAUDE.md
   ```
3. Запускать Claude Code из папки агента: `cd ~/Documents/agent && claude`. Первая просьба, например: «Прочитай web/ROADMAP.md и начни с открытого бага».

## Обновить код из GitHub

```bash
cd ~/Documents
rm -rf tmp-web
git clone -b claude/determined-ride-dfrvo4 https://github.com/andelrey/my_first_rep.git tmp-web
rsync -a --delete --exclude node_modules --exclude .next --exclude '.env*' tmp-web/agent/web/ agent/web/
rm -rf tmp-web
cd agent/web && npm install
```
(Если дальше работаете в Claude Code прямо в `~/Documents/agent/web`, удобнее сделать эту папку git-клоном — попросите Claude Code настроить.)

## Запуск

```bash
cd ~/Documents/agent/web
npm run build && npm start      # http://localhost:3000
```
Открывать в обычном браузере (Brave, Chrome), не во встроенном браузере VS Code.

## Переменные окружения

`web/.env.local` (в git не попадает). Образец — `.env.example`.

| Переменная | Где взять |
| --- | --- |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `SUPABASE_URL` | `https://<id проекта>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key (или старый anon) |
| `SUPABASE_SECRET_KEY` | там же → Secret key (или старый service_role). Никому не показывать |

Все переменные — только для сервера, в браузер не уходят. Посмотреть, какие заданы, не показывая значения: `sed 's/=.*/=…/' .env.local`.

## Supabase: настройка проекта (уже сделано для проекта владельца)

1. **SQL Editor** → по очереди выполнить файлы из `supabase/migrations/` (по возрастанию даты):
   ```bash
   cat supabase/migrations/20261014000000_init.sql | pbcopy
   cat supabase/migrations/20261015000000_open_signup.sql | pbcopy
   ```
2. **Authentication → Auth Hooks → Before User Created**: Postgres, схема `public`, функция `hook_before_user_created`.
3. **Authentication → URL Configuration**: Site URL — адрес сайта (`http://localhost:3000`, после деплоя — адрес Vercel); Redirect URLs — `<адрес>/**`.
4. **Шаблон письма** можно менять только со своим SMTP (Authentication → Emails → Set up SMTP). Тогда вставить `supabase/templates/magic_link.html` в шаблоны Magic Link и Confirm signup — ссылка заработает в любом браузере и появится код. Без своего SMTP письма приходят только участникам вашей организации в Supabase, а ссылку надо открывать в том же браузере, где запросили вход.

## Белый список

SQL Editor:
```sql
-- добавить человека (is_admin = true — видит /admin/usage)
insert into public.allowlist (email, is_admin, note) values ('name@example.com', false, 'психолог');
-- убрать (доступ закроется сразу)
delete from public.allowlist where email = 'name@example.com';
-- пускать всех / снова только по списку
insert into public.allowlist (email, note) values ('*', 'вход для всех');
delete from public.allowlist where email = '*';
```
Почту писать маленькими буквами.

## Локальная разработка и автотесты

Автотесты стирают пользователей, поэтому работают **только с локальным Supabase** (на адрес настоящего проекта откажутся запускаться).

1. Установить Docker Desktop. Поднять локальный Supabase (миграции, хук и шаблон письма применятся сами из `supabase/`):
   ```bash
   npx supabase start
   npx supabase status        # адреса и ключи
   ```
   Письма локального Supabase — http://127.0.0.1:54324.
2. `cp .env.e2e.example .env.e2e` и вставить ключи из `npx supabase status`.
3. Браузер для тестов: `npx playwright install chromium` (один раз).
4. В одном окне — приложение на локальной базе, без платных вызовов:
   ```bash
   npm run build && DRY_RUN=1 npm run start:e2e
   ```
   В другом — тесты:
   ```bash
   npm run e2e            # права доступа, вход, «пускать всех», чат
   ```
   Ошибки API: `node tests/e2e/fake-anthropic.mjs` и приложение с `ANTHROPIC_BASE_URL=http://localhost:4010 npm run start:e2e`, затем `npm run e2e:errors`.
   Кризисный ответ (платно, несколько центов): приложение без `DRY_RUN`, затем `npm run e2e:crisis`.

## Деплой

Этап 6 — см. `ROADMAP.md`.
