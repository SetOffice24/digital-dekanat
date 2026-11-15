import type { MetadataRoute } from "next";

/** Манифест: кабинет можно установить на телефон как приложение (иконка на экране, без адресной строки, push-уведомления). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Цифровой деканат · Универ",
    short_name: "Универ",
    description: "Личный кабинет студента (концепт для конкурса)",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAFAFA",
    theme_color: "#FAFAFA",
    lang: "ru",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
