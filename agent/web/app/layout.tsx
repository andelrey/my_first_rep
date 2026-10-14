import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Тренер — прототип", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
