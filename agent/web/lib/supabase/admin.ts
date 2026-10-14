// Клиент с секретным ключом: обходит RLS. Только серверный код; user_id — всегда из проверенной сессии (lib/auth.ts).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.ts";

let client: SupabaseClient | null = null;
export const supabaseAdmin = () =>
  (client ??= createClient(env.supabaseUrl(), env.supabaseSecret(), { auth: { persistSession: false, autoRefreshToken: false } }));
