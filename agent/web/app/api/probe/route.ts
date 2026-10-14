// Временная проверка этапа 1: respond() из агента вызывается на сервере. Уберу на этапе 3.
import { respond } from "@agent/pipeline.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.PROBE !== "1") return new Response("Not found", { status: 404 });
  const r = await respond([{ role: "user", content: "Боюсь подойти к девушке в кофейне" }]);
  return Response.json({ text: r.text, kind: r.kind, scenario: r.scenario, precheck: r.precheck, usage: r.usage });
}
