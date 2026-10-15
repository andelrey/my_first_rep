"use client";
// Любая ошибка страницы — понятное сообщение вместо пустого экрана. Подробности — в логе сервера (digest).

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto max-w-sm space-y-3 p-4">
      <h1 className="text-lg font-semibold">Что-то пошло не так</h1>
      <p className="text-sm text-neutral-600">Страница не загрузилась. Попробуйте ещё раз — ваши сообщения не потерялись.</p>
      {error.digest && <p className="text-xs text-neutral-400">Код ошибки: {error.digest}</p>}
      <button onClick={() => retry()} className="rounded-lg bg-neutral-900 px-3 py-2 text-white">Обновить</button>
    </main>
  );
}
