import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Кабинет полностью персональный (данные зависят от сессии) — кэш компонентов не нужен.
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  // загрузка файлов материалов и домашних заданий: до 25 МБ за запрос (лимит проверяется и в src/server/files.ts)
  // серверные действия: «Мои документы» и библиотека — один файл до 10 МБ (лимит проверяется и в коде)
  experimental: { proxyClientMaxBodySize: "26mb", serverActions: { bodySizeLimit: "12mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // микрофон — только своему сайту (голосовой ввод в помощнике); камера и геолокация закрыты
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
