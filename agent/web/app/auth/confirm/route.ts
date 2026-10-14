// Ссылка из письма. Два вида:
//   ?code=…                     — стандартное письмо Supabase; срабатывает в том же браузере, где запросили вход;
//   ?token_hash=…&type=email    — свой шаблон (когда будет свой SMTP); срабатывает в любом браузере.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server.ts";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const token_hash = q.get("token_hash");
  const sb = await supabaseServer();
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (token_hash) ok = !(await sb.auth.verifyOtp({ token_hash, type: (q.get("type") ?? "email") as EmailOtpType })).error;
  return NextResponse.redirect(new URL(ok ? "/" : "/login?e=link", req.url));
}
