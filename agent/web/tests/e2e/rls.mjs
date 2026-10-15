// Миграция: хук белого списка, вход по коду, RLS. Без браузера, через API Supabase.
import { check, done, sql, supabase, keys, resetUsers, clearMail, lastMail } from "./lib.mjs";

const { anon: ANON, secret: SECRET } = keys();
const admin = supabase(SECRET);
async function login(email) {
  const c = supabase(ANON);
  const { error } = await c.auth.signInWithOtp({ email });
  if (error) return { c, error };
  const mail = await lastMail(email);
  const v = await c.auth.verifyOtp({ email, token: mail.code, type: "email" });
  return { c, error: v.error, user: v.data.user, mail };
}

await clearMail();
resetUsers([["a@test.local"], ["b@test.local"]]);

const stranger = await login("stranger@test.local");
check("чужая почта отклонена хуком", !!stranger.error, stranger.error?.message);
check("пользователь не создан", sql("select count(*) from auth.users where email='stranger@test.local'") === "0");

const A = await login("a@test.local");
const B = await login("b@test.local");
check("вход A и B по коду", !A.error && !B.error && !!A.user && !!B.user, A.error?.message ?? B.error?.message);

const convA = (await admin.from("conversations").insert({ user_id: A.user.id }).select().single()).data;
const convB = (await admin.from("conversations").insert({ user_id: B.user.id }).select().single()).data;
check("сервер (секретный ключ) пишет", !!convA && !!convB);
await admin.from("messages").insert([
  { conversation_id: convA.id, user_id: A.user.id, role: "user", content: "привет от A", crisis: "none" },
  { conversation_id: convB.id, user_id: B.user.id, role: "user", content: "привет от B", crisis: "none" },
]);
await admin.from("memory").insert([{ user_id: A.user.id, card: { v: 1 } }, { user_id: B.user.id, card: { v: 1 } }]);
await admin.from("usage").insert({ user_id: A.user.id, model: "m", cost_usd: 0.01 });
await admin.from("review_sample").insert({ user_id: A.user.id, payload: {} });

const mA = await A.c.from("messages").select("content");
check("A видит только свои сообщения", mA.data?.length === 1 && mA.data[0].content === "привет от A");
check("A видит только свою карточку", (await A.c.from("memory").select("user_id")).data?.length === 1);
check("A не видит разговор B", (await A.c.from("conversations").select("id").eq("id", convB.id)).data?.length === 0);
check("review_sample закрыт", !!(await A.c.from("review_sample").select("id")).error);
check("allowlist закрыт", !!(await A.c.from("allowlist").select("email")).error);
check("A не может писать", !!(await A.c.from("messages").insert({ conversation_id: convA.id, user_id: A.user.id, role: "user", content: "x" })).error);
const upd = await A.c.from("messages").update({ feedback: 1 }).eq("conversation_id", convA.id).select();
check("A не может менять", !!upd.error || upd.data?.length === 0);
check("хук нельзя вызвать через API", !!(await A.c.rpc("hook_before_user_created", { event: {} })).error);
const an = await supabase(ANON).from("messages").select("id");
check("аноним ничего не видит", !!an.error || an.data?.length === 0);

sql("delete from public.allowlist where email='a@test.local'");
check("убрали из списка — A не видит даже своё", (await A.c.from("messages").select("id")).data?.length === 0);
await admin.auth.admin.deleteUser(B.user.id);
check("удаление пользователя чистит его строки", sql(`select count(*) from public.messages where user_id='${B.user.id}'`) === "0");
done();
