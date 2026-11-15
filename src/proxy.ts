import { NextResponse, type NextRequest } from "next/server";

/**
 * Быстрая проверка на границе: без cookie сессии — на /login.
 * Настоящая проверка сессии и роли — на сервере (requireStudent / requireStaff).
 * Плюс защита от CSRF: мутирующие запросы к API — только с нашего origin.
 */
const PUBLIC = ["/login", "/verify", "/manifest.webmanifest", "/sw.js", "/icon", "/favicon.ico"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method !== "GET" && req.method !== "HEAD" && pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("sid")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|ico|webp|woff2?)$).*)"],
};
