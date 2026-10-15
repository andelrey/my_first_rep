// Кто вошёл и пускать ли его. Белый список проверяется на каждом запросе:
// убрали почту из allowlist — доступ закрыт сразу, даже при живой сессии.
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server.ts";
import { supabaseAdmin } from "./supabase/admin.ts";

export type Viewer = { id: string; email: string; isAdmin: boolean };

export const normEmail = (e: string) => e.trim().toLowerCase();

// Строка «*» в allowlist — пускать всех (миграция 20261015000000_open_signup.sql). Админ — только по своей строке.
export async function allowed(email: string): Promise<{ ok: boolean; isAdmin: boolean }> {
  const e = normEmail(email);
  const { data, error } = await supabaseAdmin().from("allowlist").select("email, is_admin").in("email", [e, "*"]);
  if (error) throw new Error(`Не удалось проверить белый список: ${error.message}`);
  return { ok: !!data?.length, isAdmin: !!data?.find((r) => r.email === e)?.is_admin };
}

export async function getViewer(): Promise<Viewer | null> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser(); // проверка у сервера Supabase, а не просто чтение cookie
  const u = data.user;
  if (!u?.email) return null;
  const a = await allowed(u.email);
  return a.ok ? { id: u.id, email: u.email, isAdmin: a.isAdmin } : null;
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (!v.isAdmin) redirect("/");
  return v;
}
