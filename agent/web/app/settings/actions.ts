"use server";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth.ts";
import { deleteAll } from "@/lib/chat.ts";
import { logError } from "@/lib/errors.ts";

export async function deleteMyData(): Promise<{ error?: string }> {
  const v = await requireViewer();
  try {
    await deleteAll(v.id);
  } catch (e) {
    logError("delete", e);
    return { error: "Не удалось удалить. Попробуйте ещё раз." };
  }
  redirect("/");
}
