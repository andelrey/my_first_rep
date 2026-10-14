// Переменные окружения сервера. Все секреты — только здесь, в браузер не уходят (нет префикса NEXT_PUBLIC_).
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Нет переменной окружения ${name} — см. web/README.md`);
  return v;
}

export const env = {
  supabaseUrl: () => need("SUPABASE_URL"),
  // Публичный ключ (publishable или старый anon): с ним сервер действует от имени вошедшего пользователя.
  supabaseKey: () => need("SUPABASE_PUBLISHABLE_KEY"),
  // Секретный ключ (secret или старый service_role): обходит RLS, только для серверного кода.
  supabaseSecret: () => need("SUPABASE_SECRET_KEY"),
};
