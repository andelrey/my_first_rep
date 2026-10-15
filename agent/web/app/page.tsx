import { requireViewer } from "@/lib/auth.ts";
import { currentConversation, messages } from "@/lib/chat.ts";
import { Nav } from "@/components/nav.tsx";
import { Chat, type UiMessage } from "./chat.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const v = await requireViewer();
  // Показываем текущую сессию; после паузы > MEMORY.sessionGapHours чат начинается с чистого листа.
  const conv = await currentConversation(v.id);
  const rows = conv ? await messages(conv.id) : [];
  const initial: UiMessage[] = rows.map((m) => ({ id: m.id, role: m.role, content: m.content, kind: m.kind, in_scene: m.in_scene, feedback: m.feedback }));
  return (
    <div className="mx-auto flex h-[calc(100dvh-28px)] max-w-xl flex-col">
      <Nav active="chat" />
      <Chat initial={initial} />
    </div>
  );
}
