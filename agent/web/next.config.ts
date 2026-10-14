import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Корень агента (на уровень выше web/): оттуда импортируется src/ и читаются prompts/.
const AGENT_ROOT = fileURLToPath(new URL("..", import.meta.url));

const config: NextConfig = {
  // Код агента лежит вне web/: Turbopack и трассировка файлов должны видеть всю папку агента.
  turbopack: { root: AGENT_ROOT },
  outputFileTracingRoot: AGENT_ROOT,
  // Промпты читаются с диска (readFileSync) — в серверный бандл на Vercel их нужно положить явно.
  outputFileTracingIncludes: { "/**": ["../prompts/**/*.md"] },
};

export default config;
