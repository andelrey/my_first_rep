// Ссылка из письма: /auth/confirm?token_hash=…&type=email. Работает и в другом браузере, чем тот, где запросили вход.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server.ts";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token_hash = req.nextUrl.searchParams.get("token_hash");
  const type = (req.nextUrl.searchParams.get("type") ?? "email") as EmailOtpType;
  if (token_hash) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.redirect(new URL("/login?e=link", req.url));
}
