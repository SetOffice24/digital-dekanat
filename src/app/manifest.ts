import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Цифровой деканат · Универ",
    short_name: "Универ",
    description: "Личный кабинет студента (концепт для конкурса)",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#0f766e",
    lang: "ru",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
