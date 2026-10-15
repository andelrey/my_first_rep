"use client";
import { useEffect, useRef, useState } from "react";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: string | null;
  in_scene: boolean;
  feedback: number | null;
};

const TIMEOUT_MS = 150_000;
// Кнопка «Сейчас»: роутер агента сам узнаёт «я прямо сейчас на свидании», кнопка только начинает фразу.
const NOW_PREFIX = "Я прямо сейчас ";

export function Chat({ initial }: { initial: UiMessage[] }) {
  const [list, setList] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [list, busy, error]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setPending(t);
    setText("");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }), signal: ctl.signal });
      const j = await r.json().catch(() => ({ error: "Сервер ответил непонятно. Попробуйте ещё раз." }));
      if (!r.ok || j.error) throw new Error(j.error ?? "Что-то пошло не так. Попробуйте ещё раз.");
      setList((l) => [...l, ...j.messages]);
    } catch (e) {
      setError((e as Error).name === "AbortError" ? "Ответ не пришёл вовремя. Попробуйте отправить ещё раз." : (e as Error).message);
      setText(t); // текст не теряется: можно отправить ещё раз
    } finally {
      clearTimeout(timer);
      setPending(null);
      setBusy(false);
    }
  }

  async function rate(m: UiMessage, value: 1 | -1) {
    const next = m.feedback === value ? null : value;
    setList((l) => l.map((x) => (x.id === m.id ? { ...x, feedback: next } : x)));
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id, value: next }) }).catch(() => null);
    if (!r?.ok) setList((l) => l.map((x) => (x.id === m.id ? { ...x, feedback: m.feedback } : x)));
  }

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {!list.length && !pending && <p className="text-center text-sm text-neutral-500">Напишите, что происходит — тренер ответит.</p>}
        {list.map((m) => (
          <Bubble key={m.id} m={m} onRate={(v) => rate(m, v)} />
        ))}
        {pending && <Bubble m={{ id: "pending", role: "user", content: pending, kind: null, in_scene: false, feedback: null }} />}
        {busy && <p className="text-sm text-neutral-500" aria-live="polite">Тренер печатает…</p>}
        {error && <p role="alert" data-chat-error className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div ref={bottom} />
      </div>
      <form
        className="border-t border-neutral-200 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs"
            onClick={() => {
              setText((t) => (t.startsWith(NOW_PREFIX) ? t : NOW_PREFIX + t));
              input.current?.focus();
            }}
          >
            Сейчас
          </button>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Сообщение"
            className="flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-base"
          />
          <button disabled={busy || !text.trim()} className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40">
            Отправить
          </button>
        </div>
      </form>
    </>
  );
}

function Bubble({ m, onRate }: { m: UiMessage; onRate?: (v: 1 | -1) => void }) {
  if (m.role === "user")
    return <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-neutral-900 px-3 py-2 text-white">{m.content}</div>;

  // Кризисный ответ — как есть, выделен. Никаких ограничений и платных стен.
  if (m.kind === "crisis_stub")
    return (
      <div role="note" className="max-w-[90%] whitespace-pre-wrap rounded-2xl border-2 border-red-500 bg-red-50 px-3 py-2 text-red-950">
        {m.content}
      </div>
    );

  const rated = (v: number) => (m.feedback === v ? "bg-neutral-900 text-white" : "text-neutral-500");
  return (
    <div className="max-w-[90%]">
      <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2">{m.content}</div>
      {onRate && (
        <div className="mt-1 flex gap-1">
          <button aria-label="Хороший ответ" aria-pressed={m.feedback === 1} onClick={() => onRate(1)} className={`rounded px-1.5 text-sm ${rated(1)}`}>👍</button>
          <button aria-label="Плохой ответ" aria-pressed={m.feedback === -1} onClick={() => onRate(-1)} className={`rounded px-1.5 text-sm ${rated(-1)}`}>👎</button>
        </div>
      )}
    </div>
  );
}
