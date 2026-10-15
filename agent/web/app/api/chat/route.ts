// Сообщение в чат → respond() агента → оба сообщения в базу с флагами проверки безопасности.
// Ответ приходит целиком (не потоком): respond() проверяет готовый ответ и может его перегенерировать.
import { respond } from "@agent/pipeline.ts";
import { getViewer } from "@/lib/auth.ts";
import { currentConversation, insertMessages, loadMemory, messages, newConversation, toHistory, touchConversation, type NewMessage } from "@/lib/chat.ts";
import { logError, userError } from "@/lib/errors.ts";

export const runtime = "nodejs";
export const maxDuration = 120; // проверки + тренер + возможная перегенерация

const MAX_TEXT = 4000;

export async function POST(req: Request) {
  const v = await getViewer();
  if (!v) return Response.json({ error: "Нужно войти заново." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!text) return Response.json({ error: "Пустое сообщение." }, { status: 400 });

  try {
    // Пауза дольше MEMORY.sessionGapHours — новая сессия (обновление памяти по старой — этап 4).
    const conv = (await currentConversation(v.id)) ?? (await newConversation(v.id));
    const prev = await messages(conv.id);
    const history = toHistory([...prev, { role: "user", content: text }]);
    const memory = await loadMemory(v.id);

    const reply = await respond(history, { memory });

    // Сохраняем только после ответа: при ошибке в базе не остаётся вопроса без ответа, а текст остаётся в поле ввода.
    const rows: NewMessage[] = [
      {
        conversation_id: conv.id, role: "user", content: text,
        crisis: reply.precheck.crisis, minor_user: reply.precheck.minorUser, minor_target: reply.precheck.minorTarget,
        scenario: null, in_scene: false, kind: null,
      },
      {
        conversation_id: conv.id, role: "assistant", content: reply.text,
        crisis: null, minor_user: false, minor_target: false,
        scenario: reply.scenario, in_scene: false, kind: reply.kind,
      },
    ];
    const saved = await insertMessages(rows, v.id);
    await touchConversation(conv.id);
    return Response.json({ conversationId: conv.id, messages: saved.map(publicRow) });
  } catch (e) {
    logError("chat", e);
    return Response.json({ error: userError(e) }, { status: 502 });
  }
}

// В браузер — только то, что нужно для показа (флаги проверки безопасности не отдаём).
const publicRow = (m: { id: string; role: string; content: string; kind: string | null; in_scene: boolean; feedback: number | null }) => ({
  id: m.id, role: m.role, content: m.content, kind: m.kind, in_scene: m.in_scene, feedback: m.feedback,
});
