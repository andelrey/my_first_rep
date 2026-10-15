-- Переключатель «пускать всех»: строка '*' в allowlist.
--   insert into public.allowlist (email, note) values ('*', 'вход для всех');  — любой, кто вошёл по почте;
--   delete from public.allowlist where email = '*';                            — снова только список.
-- Админ — только по своей строке с is_admin (строка '*' админом не делает: см. lib/auth.ts).

create or replace function private.is_allowed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.allowlist a where a.email in (lower(auth.jwt() ->> 'email'), '*'))
$$;

create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable
as $$
begin
  if exists (select 1 from public.allowlist where email in (lower(btrim(event -> 'user' ->> 'email')), '*')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Этой почты нет в списке тестировщиков.'));
end;
$$;
