// Палец вверх / вниз под ответом тренера → messages.feedback. Повторное нажатие снимает оценку (null).
import { getViewer } from "@/lib/auth.ts";
import { setFeedback } from "@/lib/chat.ts";
import { logError } from "@/lib/errors.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const v = await getViewer();
  if (!v) return Response.json({ error: "Нужно войти заново." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: unknown; value?: unknown } | null;
  const value = b?.value === 1 || b?.value === -1 ? b.value : b?.value === null ? null : undefined;
  if (typeof b?.id !== "string" || value === undefined) return Response.json({ error: "Неверный запрос." }, { status: 400 });
  try {
    const ok = await setFeedback(v.id, b.id, value);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "Нет такого ответа." }, { status: 404 });
  } catch (e) {
    logError("feedback", e);
    return Response.json({ error: "Не удалось сохранить оценку." }, { status: 500 });
  }
}
