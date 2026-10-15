import { requireViewer } from "@/lib/auth.ts";
import { Nav } from "@/components/nav.tsx";
import { logout } from "../login/actions.ts";
import { DeleteButton } from "./delete-button.tsx";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const v = await requireViewer();
  return (
    <div className="mx-auto max-w-xl">
      <Nav active="settings" />
      <main className="space-y-6 p-4">
        <section className="space-y-1">
          <p className="text-sm text-neutral-600">Вы вошли как {v.email}{v.isAdmin ? " (админ)" : ""}.</p>
          <form action={logout}>
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">Выйти</button>
          </form>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">Удалить мои данные</h2>
          <p className="text-sm text-neutral-600">Удалятся все разговоры, память о вас и статистика. Почта для входа останется.</p>
          <DeleteButton />
        </section>
      </main>
    </div>
  );
}
