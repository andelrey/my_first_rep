// Ошибки из браузера → лог сервера: чтобы видеть их в терминале или в логах Vercel без консоли браузера.
// Пишем только техническое: сообщение ошибки и первые строки стека, обрезанные. Текста переписки здесь нет.
import { getViewer } from "@/lib/auth.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await getViewer())) return new Response(null, { status: 401 });
  const b = (await req.json().catch(() => null)) as { message?: unknown; stack?: unknown; where?: unknown } | null;
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  console.error(`[client] ${s(b?.where, 40)}: ${s(b?.message, 300)}\n${s(b?.stack, 1200).split("\n").slice(0, 8).join("\n")}`);
  return new Response(null, { status: 204 });
}
