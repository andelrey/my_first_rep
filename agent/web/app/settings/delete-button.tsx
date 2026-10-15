"use client";
import { useState, useTransition } from "react";
import { deleteMyData } from "./actions.ts";

export function DeleteButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        className="rounded-lg border border-red-600 px-3 py-2 text-red-700 disabled:opacity-50"
        onClick={() => {
          if (!confirm("Удалить все ваши разговоры, память о вас и статистику? Отменить будет нельзя.")) return;
          start(async () => setError((await deleteMyData())?.error ?? null));
        }}
      >
        {pending ? "Удаляю…" : "Удалить мои данные"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
