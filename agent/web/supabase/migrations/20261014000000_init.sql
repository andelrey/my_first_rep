-- Прототип тренера: схема данных.
--
-- Кто что может:
--   - сервер (Next.js, ключ service_role) — читает и пишет всё; доступ к чужим данным он не даёт: user_id берёт из проверенной сессии;
--   - пользователь через API Supabase (ключ anon + его вход) — только ЧИТАЕТ своё и только пока его почта в белом списке;
--   - аноним — ничего.
-- Писать в таблицы напрямую из браузера нельзя: все изменения идут через сервер.
--
-- Почты в белый список здесь не добавляются (репозиторий публичный) — см. web/README.md.

-- ---------- Белый список ----------

create table public.allowlist (
  email      text primary key check (email = lower(btrim(email))),
  is_admin   boolean not null default false,   -- видит /admin/usage
  note       text,                             -- кто это: «психолог», «панель» — для вас, приложение не читает
  created_at timestamptz not null default now()
);

-- Почта текущего пользователя в белом списке? Для RLS ниже.
-- security definer: пользователь не может читать allowlist сам, а проверка должна работать.
create schema if not exists private;
create function private.is_allowed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.allowlist a where a.email = lower(auth.jwt() ->> 'email'))
$$;
revoke all on function private.is_allowed() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_allowed() to authenticated;

-- Хук Supabase Auth «Before User Created»: почту не из белого списка Supabase даже не зарегистрирует
-- (и письмо со ссылкой не уйдёт). Включается в панели: Authentication → Hooks (см. README).
-- Без security definer, как советует документация Supabase: доступ к allowlist выдан роли supabase_auth_admin явно.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable
as $$
begin
  if exists (select 1 from public.allowlist where email = lower(btrim(event -> 'user' ->> 'email'))) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Этой почты нет в списке тестировщиков.'));
end;
$$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;

-- ---------- Память: карточка из src/memory.ts одной колонкой ----------

create table public.memory (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  card       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Разговоры ----------
-- Разговор = сессия. Новая начинается после паузы > MEMORY.sessionGapHours или после конца сцены тренажёра.

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  started_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  memory_updated  boolean not null default false,  -- updateMemory по этой сессии уже прошёл
  scene           jsonb                            -- SceneState тренажёра, пока сцена идёт; иначе null
);
create index conversations_user_last on public.conversations (user_id, last_message_at desc);

-- ---------- Сообщения ----------
-- Скриншот не хранится: в content — текст сообщения и пометка «[скриншот]».

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- Флаги проверки безопасности (Reply.precheck) — на сообщении пользователя.
  crisis          text check (crisis in ('none', 'possible', 'clear')),
  minor_user      boolean not null default false,
  minor_target    boolean not null default false,
  scenario        text,                                -- Reply.scenario (у ответа)
  in_scene        boolean not null default false,      -- реплика сцены тренажёра (его ход, её ответ, вводная)
  -- Чей это ответ, для показа: тренер, кризисный шаблон, вводная сцены, реплика девушки, разбор сцены, выход из роли.
  kind            text check (kind in ('coach', 'crisis_stub', 'intro', 'persona', 'feedback', 'exit')),
  feedback        smallint check (feedback in (-1, 1)),
  created_at      timestamptz not null default now()
);
create index messages_conversation on public.messages (conversation_id, created_at);
create index messages_user on public.messages (user_id);

-- ---------- Стоимость ----------
-- reply — ответ на сообщение (respond: проверки + тренер), memory — updateMemory, scene — prepareScene.

create table public.usage (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  message_id         uuid references public.messages (id) on delete set null,
  kind               text not null default 'reply' check (kind in ('reply', 'memory', 'scene')),
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12, 6) not null default 0,
  created_at         timestamptz not null default now()
);
create index usage_created on public.usage (created_at);
create index usage_user on public.usage (user_id);

-- ---------- Выборка для психолога (заготовка, без логики) ----------

create table public.review_sample (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,  -- только чтобы «удалить всё» удаляло и отсюда
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- Права и RLS ----------

alter table public.allowlist     enable row level security;
alter table public.memory        enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.usage         enable row level security;
alter table public.review_sample enable row level security;

-- Таблицы закрыты для всех, кроме сервера; пользователю — только чтение своего.
revoke all on public.allowlist, public.memory, public.conversations, public.messages, public.usage, public.review_sample from anon, authenticated;
grant select on public.memory, public.conversations, public.messages, public.usage to authenticated;
grant all on public.allowlist, public.memory, public.conversations, public.messages, public.usage, public.review_sample to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Хук читает белый список.
grant select on public.allowlist to supabase_auth_admin;
create policy "auth: читать белый список" on public.allowlist for select to supabase_auth_admin using (true);

create policy "своя карточка" on public.memory for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()));
create policy "свои разговоры" on public.conversations for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()));
create policy "свои сообщения" on public.messages for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()));
create policy "своя стоимость" on public.usage for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_allowed()));
-- review_sample: политик нет — только сервер.
