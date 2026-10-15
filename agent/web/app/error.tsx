"use client";
// Любая ошибка страницы — понятное сообщение вместо пустого экрана.
// Ошибка из браузера уходит в лог сервера (/api/client-error); у ошибки сервера есть digest — по нему искать в логе.
import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (error.digest) return; // серверная ошибка уже в логе сервера
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ where: location.pathname, message: error.message, stack: error.stack }),
    }).catch(() => {});
  }, [error]);
  return (
    <main className="mx-auto max-w-sm space-y-3 p-4">
      <h1 className="text-lg font-semibold">Что-то пошло не так</h1>
      <p className="text-sm text-neutral-600">Страница не загрузилась. Попробуйте ещё раз — ваши сообщения не потерялись.</p>
      <p className="break-words text-xs text-neutral-400">{error.digest ? `Код ошибки: ${error.digest}` : `Ошибка: ${error.message}`}</p>
      <button onClick={() => retry()} className="rounded-lg bg-neutral-900 px-3 py-2 text-white">Обновить</button>
    </main>
  );
}
