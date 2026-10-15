// Ошибки API — понятным текстом в чате. Нужны: node tests/e2e/fake-anthropic.mjs
// и приложение, запущенное с ANTHROPIC_BASE_URL=http://localhost:4010.
import { writeFileSync } from "node:fs";
import { check, done, sql, resetUsers, clearMail, launch, login } from "./lib.mjs";

resetUsers([["me@test.local"]]);
await clearMail();
const b = await launch();
const page = await login(b, "me@test.local");
for (const [mode, expect] of [["credit", "кончились кредиты API"], ["overloaded", "перегружена"]]) {
  writeFileSync(new URL("./.fake-mode", import.meta.url), mode);
  await page.fill("textarea", "Проверка ошибки " + mode);
  await page.click("text=Отправить");
  const err = page.locator("[data-chat-error]");
  await err.waitFor({ timeout: 60000 });
  check(`${mode}: понятное сообщение`, (await err.innerText()).includes(expect), await err.innerText());
  check(`${mode}: текст вернулся в поле ввода`, (await page.inputValue("textarea")) === "Проверка ошибки " + mode);
}
check("в базе ничего не сохранилось", sql("select count(*) from messages") === "0");
await b.close();
done();
