// Чат: ответ, флаги, оценки, кризисный ответ, новая сессия, «Сейчас», «удалить всё».
// Бесплатно — приложение запущено с DRY_RUN=1 (агент отвечает заглушками). С настоящим агентом — без DRY_RUN.
import { APP, check, done, sql, resetUsers, clearMail, launch, login } from "./lib.mjs";

resetUsers([["me@test.local", true]]);
await clearMail();
const b = await launch();
const page = await login(b, "me@test.local");
// Любая ошибка в браузере — провал. Ошибку рендера React ловит error.tsx, и pageerror её не видит:
// поэтому отдельно смотрим, не появилась ли страница «Что-то пошло не так» (say ниже).
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const errorPage = page.locator("h1", { hasText: "Что-то пошло не так" });
// Как в новых Chrome/Brave: scrollIntoView возвращает Promise. Иначе на старом Chromium Playwright
// не поймать «destroy is not a function» (эффект с неявным return).
await page.addInitScript(() => {
  const orig = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...a) { orig.apply(this, a); return Promise.resolve(); };
});
await page.reload();
const uid = sql("select id from auth.users where email='me@test.local'");
const assistants = page.locator(".bg-neutral-100");

async function say(text) {
  const before = await assistants.count();
  await page.fill("textarea", text);
  await page.click("text=Отправить");
  const typing = await page.getByText("Тренер печатает…").isVisible().catch(() => false);
  await page.waitForFunction(
    (n) => document.querySelectorAll(".bg-neutral-100").length > n || document.querySelector("[data-chat-error]") || [...document.querySelectorAll("h1")].some((h) => h.textContent.includes("Что-то пошло не так")),
    before, { timeout: 150000 });
  await page.waitForTimeout(300); // эффекты после ответа (прокрутка) успевают отработать
  const shown = (await errorPage.count()) ? await page.locator("main p").last().textContent() : ""; // «Ошибка: …»
  check(`после «${text.slice(0, 20)}…» нет страницы ошибки`, !shown, shown);
  return typing;
}

check("индикатор «печатает…»", await say("Боюсь подойти к девушке в кофейне, что делать?"));
check("ответ тренера показан", (await assistants.count()) === 1);
check("поле ввода очищено", (await page.inputValue("textarea")) === "");
const rows = sql(`select role||':'||coalesce(crisis,'-')||':'||minor_user||':'||minor_target||':'||coalesce(kind,'-') from messages where user_id='${uid}' order by created_at`).split("\n");
check("в базе вопрос с флагами и ответ с kind", rows.length === 2 && rows[0] === "user:none:false:false:-" && rows[1] === "assistant:-:false:false:coach", rows.join(" | "));

const fb = () => sql(`select coalesce(feedback::text,'null') from messages where user_id='${uid}' and role='assistant'`);
await page.getByLabel("Хороший ответ").click(); await page.waitForTimeout(500);
check("👍 → 1", fb() === "1");
await page.getByLabel("Плохой ответ").click(); await page.waitForTimeout(500);
check("👎 → -1", fb() === "-1");
await page.getByLabel("Плохой ответ").click(); await page.waitForTimeout(500);
check("повторное нажатие снимает оценку", fb() === "null");

await page.reload();
check("после перезагрузки история на месте", (await assistants.count()) === 1);

const conv = sql(`select id from conversations where user_id='${uid}'`);
sql(`insert into messages(conversation_id,user_id,role,content,kind,created_at) values ('${conv}','${uid}','assistant','[тест] кризисный шаблон','crisis_stub', now()+interval '1 second')`);
await page.reload();
check("кризисный ответ выделен", (await page.locator('[role="note"]').count()) === 1);
check("под кризисным ответом нет оценки", (await page.getByLabel("Хороший ответ").count()) === 1);

const st = await page.evaluate(async () => (await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", value: 1 }) })).status);
check("оценка чужого/несуществующего ответа — 404", st === 404);

sql(`update conversations set last_message_at = now() - interval '4 hours' where user_id='${uid}'`);
await page.reload();
check("после паузы чат начинается заново", (await assistants.count()) === 0);
await say("Привет, я снова тут");
check("новое сообщение — в новом разговоре", sql(`select count(*) from conversations where user_id='${uid}'`) === "2");

await page.click("text=Сейчас");
check("«Сейчас» подставляет начало фразы", (await page.inputValue("textarea")) === "Я прямо сейчас ");
await page.fill("textarea", "");

sql(`insert into usage(user_id, model, cost_usd) values ('${uid}','test',0.01)`);
sql(`insert into memory(user_id, card) values ('${uid}','{"v":1}')`);
sql(`insert into review_sample(user_id, payload) values ('${uid}','{}')`);
await page.click("text=Настройки");
let dialog = "";
page.once("dialog", (d) => { dialog = d.message(); d.accept(); });
await page.getByRole("button", { name: "Удалить мои данные" }).click();
await page.waitForURL(APP + "/");
check("подтверждение одним диалогом", dialog.includes("Отменить будет нельзя"));
const left = ["messages", "conversations", "memory", "usage", "review_sample"].map((t) => `${t}=${sql(`select count(*) from ${t} where user_id='${uid}'`)}`);
check("в базе пусто", left.every((x) => x.endsWith("=0")), left.join(" "));
check("в браузере не было ошибок", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
await b.close();
done();
