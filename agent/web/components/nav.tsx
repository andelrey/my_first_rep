import Link from "next/link";

// Верхняя навигация: мобильная ширина в приоритете.
export function Nav({ active }: { active: "chat" | "memory" | "settings" | "admin" }) {
  const item = (href: string, key: string, label: string) => (
    <Link href={href} className={`rounded-md px-2 py-1 ${active === key ? "bg-neutral-900 text-white" : "text-neutral-700"}`}>
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-1 border-b border-neutral-200 px-3 py-2 text-sm">
      {item("/", "chat", "Чат")}
      {item("/settings", "settings", "Настройки")}
    </nav>
  );
}
