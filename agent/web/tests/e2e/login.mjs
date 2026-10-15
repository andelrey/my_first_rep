// Вход в браузере: по коду и по ссылке (свой шаблон письма), белый список.
import { APP, check, done, sql, resetUsers, clearMail, lastMail, launch } from "./lib.mjs";

resetUsers([["me@test.local", true], ["tester@test.local"]]);
await clearMail();
const b = await launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();

await page.goto(APP + "/");
check("без входа — на /login", page.url().endsWith("/login"));
check("плашка прототипа видна", await page.getByText("Прототип для тестирования. Не для экстренной помощи.").isVisible());
check("API без входа — 401", (await fetch(APP + "/api/feedback", { method: "POST" })).status === 401);

await page.fill('input[name="email"]', "stranger@test.local");
await page.click("button");
await page.getByText("нет в списке тестировщиков").waitFor();
check("чужая почта: понятный отказ", true);

await page.fill('input[name="email"]', "Me@Test.local ");
await page.click("button");
await page.getByPlaceholder("Код из письма").waitFor();
const m1 = await lastMail("me@test.local");
await page.fill('input[name="code"]', "000000");
await page.click("button");
await page.getByText("Код не подошёл").waitFor();
check("неверный код — понятная ошибка", true);
await page.fill('input[name="code"]', m1.code);
await page.click("button");
await page.getByPlaceholder("Сообщение").waitFor();
check("вход по коду", true);

await clearMail();
const p2 = await (await b.newContext()).newPage();
await p2.goto(APP + "/login");
await p2.fill('input[name="email"]', "tester@test.local");
await p2.click("button");
await p2.getByPlaceholder("Код из письма").waitFor();
const m2 = await lastMail("tester@test.local");
const other = await (await b.newContext()).newPage();
await other.goto(m2.link);
await other.getByPlaceholder("Сообщение").waitFor();
check("вход по ссылке в другом браузере", true);
const third = await (await b.newContext()).newPage();
await third.goto(m2.link);
check("повторная ссылка не пускает", third.url().includes("/login?e=link"));

sql("delete from public.allowlist where email='tester@test.local'");
await other.goto(APP + "/");
check("убрали из списка — снова вход", other.url().endsWith("/login"));
await b.close();
done();
