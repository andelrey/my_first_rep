"use client";
import { useActionState, useEffect, useState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions.ts";

// Supabase возвращает причину отказа в #error_code=… (до сервера эта часть адреса не доходит).
const HASH_ERRORS: Record<string, string> = {
  otp_expired: "Ссылка уже использована или устарела. Каждая новая ссылка отменяет прежние — откройте самое последнее письмо.",
};

export function LoginForm({ notice: serverNotice }: { notice?: string }) {
  const [notice, setNotice] = useState(serverNotice);
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("error_code");
    if (code && HASH_ERRORS[code]) setNotice(HASH_ERRORS[code]);
  }, []);
  const [emailState, sendAction, sending] = useActionState(sendCode, { step: "email", email: "" } as LoginState);
  const [codeState, verifyAction, verifying] = useActionState(verifyCode, { step: "code", email: "" } as LoginState);

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-base";
  const button = "w-full rounded-lg bg-neutral-900 px-3 py-2 text-white disabled:opacity-50";

  if (emailState.step === "code")
    return (
      <form action={verifyAction} className="space-y-3">
        <p className="text-sm text-neutral-700">{emailState.info}</p>
        <p className="text-sm text-neutral-500">Почта: {emailState.email}</p>
        <input type="hidden" name="email" value={emailState.email} />
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Код из письма" className={input} />
        {codeState.error && <p className="text-sm text-red-700">{codeState.error}</p>}
        <button disabled={verifying} className={button}>{verifying ? "Проверяю…" : "Войти"}</button>
      </form>
    );

  return (
    <form action={sendAction} className="space-y-3">
      {notice && <p className="text-sm text-red-700">{notice}</p>}
      <input name="email" type="email" autoComplete="email" required placeholder="Почта" defaultValue={emailState.email} className={input} />
      {emailState.error && <p className="text-sm text-red-700">{emailState.error}</p>}
      <button disabled={sending} className={button}>{sending ? "Отправляю…" : "Получить ссылку для входа"}</button>
    </form>
  );
}
