// Клиент Supabase от имени вошедшего пользователя (сессия — в cookie). Только сервер.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env.ts";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Из серверного компонента cookie не записать — сессию обновляет proxy.ts.
        }
      },
    },
  });
}
