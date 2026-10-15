// Разговоры и сообщения в базе. Только сервер; user_id — всегда из проверенной сессии (lib/auth.ts).
import { isSessionOver, toMemory, type Memory } from "@agent/memory.ts";
import type { Msg } from "@agent/llm.ts";
import { supabaseAdmin } from "./supabase/admin.ts";

export const HISTORY = 20; // сколько последних сообщений разговора уходит в модель

export type Kind = "coach" | "crisis_stub" | "intro" | "persona" | "feedback" | "exit";
export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  crisis: "none" | "possible" | "clear" | null;
  minor_user: boolean;
  minor_target: boolean;
  scenario: string | null;
  in_scene: boolean;
  kind: Kind | null;
  feedback: -1 | 1 | null;
  created_at: string;
};
export type ConversationRow = {
  id: string;
  user_id: string;
  started_at: string;
  last_message_at: string;
  memory_updated: boolean;
  scene: unknown | null;
};

const db = () => supabaseAdmin();
const fail = (what: string, e: { message: string } | null) => {
  if (e) throw new Error(`${what}: ${e.message}`);
};

export async function lastConversation(userId: string): Promise<ConversationRow | null> {
  const { data, error } = await db().from("conversations").select("*").eq("user_id", userId).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  fail("разговор", error);
  return data;
}

// Текущий разговор, если сессия ещё идёт: пауза не дольше MEMORY.sessionGapHours.
export async function currentConversation(userId: string, now = new Date()): Promise<ConversationRow | null> {
  const c = await lastConversation(userId);
  return c && !isSessionOver(c.last_message_at, now) ? c : null;
}

export async function newConversation(userId: string): Promise<ConversationRow> {
  const { data, error } = await db().from("conversations").insert({ user_id: userId }).select().single();
  fail("новый разговор", error);
  return data!;
}

export async function messages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await db().from("messages").select("*").eq("conversation_id", conversationId).order("created_at").order("id");
  fail("сообщения", error);
  return data ?? [];
}

// История для модели: последние HISTORY сообщений; первым должно идти сообщение пользователя.
export function toHistory(rows: Pick<MessageRow, "role" | "content">[]): Msg[] {
  const h = rows.slice(-HISTORY).map((r) => ({ role: r.role, content: r.content }));
  while (h.length && h[0].role !== "user") h.shift();
  return h;
}

export async function loadMemory(userId: string): Promise<Memory> {
  const { data, error } = await db().from("memory").select("card").eq("user_id", userId).maybeSingle();
  fail("карточка", error);
  return toMemory(data?.card);
}

export type NewMessage = Omit<MessageRow, "id" | "created_at" | "feedback">;

export async function insertMessages(rows: NewMessage[], userId: string): Promise<MessageRow[]> {
  // created_at задаём явно с шагом 1 мс: порядок сообщения и ответа не зависит от часов базы.
  const t = Date.now();
  const { data, error } = await db()
    .from("messages")
    .insert(rows.map((r, i) => ({ ...r, user_id: userId, created_at: new Date(t + i).toISOString() })))
    .select();
  fail("сохранить сообщения", error);
  return (data ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function touchConversation(id: string, patch: Partial<Pick<ConversationRow, "scene" | "memory_updated">> = {}) {
  const { error } = await db().from("conversations").update({ last_message_at: new Date().toISOString(), ...patch }).eq("id", id);
  fail("обновить разговор", error);
}

export async function setFeedback(userId: string, messageId: string, value: -1 | 1 | null): Promise<boolean> {
  const { data, error } = await db().from("messages").update({ feedback: value }).eq("id", messageId).eq("user_id", userId).eq("role", "assistant").select("id");
  fail("оценка", error);
  return !!data?.length;
}

// «Удалить мои данные»: всё, кроме самого входа (почта остаётся в Supabase Auth, чтобы можно было войти снова).
export async function deleteAll(userId: string) {
  for (const t of ["usage", "messages", "conversations", "memory", "review_sample"]) {
    const { error } = await db().from(t).delete().eq("user_id", userId);
    fail(`удалить ${t}`, error);
  }
}
