// Переключатель «пускать всех»: строка '*' в allowlist.
import { APP, check, done, sql, resetUsers, clearMail, lastMail, launch } from "./lib.mjs";

resetUsers([["me@test.local", true]]);
await clearMail();
const b = await launch();
async function tryLogin(email) {
  const p = await (await b.newContext()).newPage();
  await p.goto(APP + "/login");
  await p.fill('input[name="email"]', email);
  await p.click("button");
  await Promise.race([p.getByPlaceholder("Код из письма").waitFor(), p.getByText("нет в списке").waitFor()]);
  if (await p.getByText("нет в списке").isVisible()) return { p, text: "отказ" };
  await p.fill('input[name="code"]', (await lastMail(email)).code);
  await p.click("button");
  await p.getByPlaceholder("Сообщение").waitFor();
  await p.goto(APP + "/settings");
  return { p, text: await p.innerText("main") };
}
check("без «*» чужого не пускает", (await tryLogin("anyone@test.local")).text === "отказ");
sql("insert into public.allowlist(email, note) values ('*', 'вход для всех')");
const r = await tryLogin("anyone@test.local");
check("с «*» любой входит", r.text.includes("anyone@test.local"));
check("и не становится админом", !r.text.includes("админ"));
check("админ остаётся админом", (await tryLogin("me@test.local")).text.includes("(админ)"));
sql("delete from public.allowlist where email='*'");
await r.p.goto(APP + "/");
check("убрали «*» — посторонний вылетает", r.p.url().endsWith("/login"));
await b.close();
done();
