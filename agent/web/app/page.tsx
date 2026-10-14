import { requireViewer } from "@/lib/auth.ts";
import { logout } from "./login/actions.ts";

export const dynamic = "force-dynamic";

// Этап 2: только проверка входа. Чат — на этапе 3.
export default async function Home() {
  const v = await requireViewer();
  return (
    <main className="mx-auto max-w-xl space-y-3 p-4">
      <p>Вы вошли как {v.email}{v.isAdmin ? " (админ)" : ""}.</p>
      <form action={logout}>
        <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">Выйти</button>
      </form>
    </main>
  );
}
