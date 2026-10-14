"use server";
// Вход по почте: Supabase присылает письмо со ссылкой и 6-значным кодом (шаблон — supabase/templates/magic_link.html).
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server.ts";
import { allowed, normEmail } from "@/lib/auth.ts";

export type LoginState = { step: "email" | "code"; email: string; error?: string; info?: string };

export async function sendCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = normEmail(String(form.get("email") ?? ""));
  if (!/^\S+@\S+\.\S+$/.test(email)) return { step: "email", email, error: "Проверьте почту — похоже, в ней опечатка." };
  try {
    if (!(await allowed(email)).ok) return { step: "email", email, error: "Этой почты нет в списке тестировщиков. Прототип закрытый." };
    const sb = await supabaseServer();
    // Стандартное письмо Supabase (без своего SMTP шаблон не поменять) ведёт сюда с ?code=… — см. app/auth/confirm.
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${await origin()}/auth/confirm` } });
    if (error) return { step: "email", email, error: authError(error.message) };
  } catch (e) {
    console.error("login: sendCode", (e as Error).message);
    return { step: "email", email, error: "Сервер входа не отвечает. Попробуйте через минуту." };
  }
  return { step: "code", email, info: "Письмо отправлено. Откройте ссылку из письма в этом же браузере. Если в письме есть код — можно ввести его здесь." };
}

export async function verifyCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = normEmail(String(form.get("email") ?? ""));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  const back: LoginState = { step: "code", email };
  if (token.length < 6) return { ...back, error: "В коде 6 цифр." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ...back, error: "Код не подошёл или устарел. Запросите новый." };
  redirect("/");
}

export async function logout() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https")}://${host}`;
}

function authError(m: string): string {
  if (/rate limit|too many|security purposes/i.test(m)) return "Слишком часто. Подождите минуту и попробуйте снова.";
  if (/not authorized|tester|списке/i.test(m)) return "Этой почты нет в списке тестировщиков. Прототип закрытый.";
  return "Не получилось отправить письмо. Попробуйте ещё раз.";
}
