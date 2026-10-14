import { LoginForm } from "./form.tsx";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  link: "Ссылка не сработала: устарела или открыта в другом браузере. Запросите новую здесь и откройте письмо в этом же браузере.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="mb-1 text-xl font-semibold">Вход</h1>
      <p className="mb-4 text-sm text-neutral-600">Прототип закрытый: войти можно только с почты из списка тестировщиков.</p>
      <LoginForm notice={e ? NOTICE[e] : undefined} />
    </main>
  );
}
