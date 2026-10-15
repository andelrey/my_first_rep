// Общее для e2e-проверок. Запуск: из web/, локальный Supabase (npx supabase start) и приложение на :3000.
// ⚠️ Проверки СТИРАЮТ пользователей и белый список — поэтому работают только с локальной базой.
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

export const APP = process.env.APP_URL ?? "http://localhost:3000";
export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324"; // почтовый ящик локального Supabase
export const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SB_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

const local = (u) => /^(\w+:\/\/)?([^@/]*@)?(localhost|127\.0\.0\.1)[:/]/.test(u);
for (const [name, u] of [["DB_URL", DB_URL], ["SUPABASE_URL", SB_URL], ["APP_URL", APP]])
  if (!local(u)) {
    console.error(`Стоп: ${name}=${u} — не локальный адрес. Эти проверки стирают данные и запускаются только на локальном Supabase.`);
    process.exit(2);
  }

export const sql = (q) => execFileSync("psql", [DB_URL, "-tAc", q]).toString().trim();

let fails = 0;
export const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails++;
};
export const done = () => {
  console.log(fails ? `\nПровалено: ${fails}` : "\nВсе проверки пройдены");
  process.exit(fails ? 1 : 0);
};

export const supabase = (key) => createClient(SB_URL, key, { auth: { persistSession: false } });
export const keys = () => ({ anon: need("SUPABASE_PUBLISHABLE_KEY"), secret: need("SUPABASE_SECRET_KEY") });
function need(n) {
  if (!process.env[n]) { console.error(`Нет ${n}: запускайте через npm run e2e:* (берёт .env.e2e, см. README)`); process.exit(2); }
  return process.env[n];
}

// Белый список и пользователи — с чистого листа.
export function resetUsers(rows) {
  sql("delete from public.allowlist; delete from auth.users;");
  for (const [email, admin] of rows) sql(`insert into public.allowlist(email, is_admin) values ('${email}', ${!!admin})`);
}

export const clearMail = () => fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
export async function lastMail(email) {
  for (let i = 0; i < 30; i++) {
    const l = await (await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    if (l.messages?.length) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${l.messages[0].ID}`)).json();
      return { code: m.HTML.match(/<b>(\d{6})<\/b>/)?.[1], link: m.HTML.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&"), html: m.HTML, subject: m.Subject };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// PW_CHROMIUM — путь к Chromium, если не ставили браузеры Playwright (npx playwright install chromium).
export const launch = () => chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
export const phone = { viewport: { width: 390, height: 780 } };

// Вход по коду из письма (шаблон supabase/templates/magic_link.html).
export async function login(browser, email, ctx = phone) {
  const page = await (await browser.newContext(ctx)).newPage();
  await page.goto(APP + "/login");
  await page.fill('input[name="email"]', email);
  await page.click("button");
  await page.getByPlaceholder("Код из письма").waitFor();
  await page.fill('input[name="code"]', (await lastMail(email)).code);
  await page.click("button");
  await page.getByPlaceholder("Сообщение").waitFor();
  return page;
}
