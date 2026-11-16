import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Кабинет полностью персональный (данные зависят от сессии) — кэш компонентов не нужен.
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  // загрузка файлов материалов и домашних заданий: до 25 МБ за запрос (лимит проверяется и в src/server/files.ts)
  experimental: { proxyClientMaxBodySize: "26mb" },
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
