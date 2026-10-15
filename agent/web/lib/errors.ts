// Ошибка API → понятный текст в чате. Подробности — только в лог сервера, без текста сообщений и картинок.
import { isFatal, fatalReason } from "@agent/errors.ts";

export function userError(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  if (isFatal(e)) return `Тренер сейчас недоступен: ${fatalReason(e)}. Напишите владельцу прототипа.`;
  if (/overloaded|529|rate.?limit|429/i.test(m)) return "Модель сейчас перегружена. Попробуйте через минуту.";
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(m)) return "Ответ не пришёл вовремя. Попробуйте отправить ещё раз.";
  if (/больше 5 МБ/.test(m)) return "Картинка слишком большая. Попробуйте другую.";
  return "Что-то пошло не так. Попробуйте отправить ещё раз.";
}

// В лог — только первая строка сообщения ошибки (там нет текста пользователя и base64).
export const logError = (where: string, e: unknown) => console.error(`[${where}]`, String((e as Error)?.message ?? e).split("\n")[0].slice(0, 300));
