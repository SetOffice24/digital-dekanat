import "server-only";
import webpush from "web-push";
import { prisma } from "./db";

/**
 * Push-уведомления на телефон/компьютер (стандарт Web Push, ключи VAPID).
 * Работают, даже когда приложение закрыто — если кабинет установлен на телефон (PWA) или открыт в браузере с разрешением.
 * Без ключей в окружении — тихо выключены: остальная система работает как раньше.
 */
const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
export const pushEnabled = Boolean(pub && priv);
if (pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:dekanat@univer.example", pub!, priv!);

export const vapidPublicKey = () => (pushEnabled ? pub! : null);

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/**
 * Куда сервер вправе отправлять push: только push-сервисы браузеров (Chrome/Яндекс/Edge через FCM и WNS,
 * Firefox — Mozilla, Safari — Apple). Произвольный адрес в подписке иначе заставил бы сервер ходить
 * по внутренним адресам (SSRF). HTTPS, порт 443, без логина в адресе; поддомены — только с границей по точке.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const PUSH_SUFFIXES = [".notify.windows.com", ".push.apple.com", ".push.services.mozilla.com"];
export function isAllowedPushEndpoint(endpoint: string) {
  if (endpoint.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS.includes(h) || PUSH_SUFFIXES.some((s) => h.endsWith(s) && h.length > s.length);
}
const MAX_SUBS_PER_USER = 10;
const PUSH_TIMEOUT_MS = 10_000;

/** Отправить push всем устройствам пользователей. Мёртвые подписки (404/410) удаляются. Ошибки не роняют вызывающий код. */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!pushEnabled || !userIds.length) return { sent: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 120), body: payload.body.slice(0, 300) });
  // локально интернет идёт через прокси; на сервере переменной нет — прямое соединение
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || undefined;
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      // старые записи перепроверяем перед отправкой: подписку на чужой адрес удаляем, не отправляя
      if (!isAllowedPushEndpoint(s.endpoint)) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 3600, urgency: "high", proxy, timeout: PUSH_TIMEOUT_MS });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("push failed", code ?? (e as Error).name);
      }
    }),
  );
  return { sent };
}

const B64URL = /^[A-Za-z0-9_-]+=*$/;

/** Сохранить подписку устройства за текущим пользователем (повторная подписка того же устройства — перезапись). */
export async function savePushSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string | null) {
  const ok =
    isAllowedPushEndpoint(sub.endpoint) && B64URL.test(sub.keys.p256dh) && sub.keys.p256dh.length <= 200 && B64URL.test(sub.keys.auth) && sub.keys.auth.length <= 100;
  if (!ok) return false;
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint }, select: { userId: true, p256dh: true, auth: true } });
  // чужой endpoint можно «перехватить» только тем же браузером (совпадают ключи) — иначе чужие push ушли бы не тому
  if (existing && existing.userId !== userId && (existing.p256dh !== sub.keys.p256dh || existing.auth !== sub.keys.auth)) return false;
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 200) },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 200) },
  });
  // не больше 10 устройств на человека: самые старые подписки вытесняются
  const extra = await prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: MAX_SUBS_PER_USER, select: { id: true } });
  if (extra.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((x) => x.id) } } });
  return true;
}

export async function removePushSubscription(userId: string, endpoint: string) {
  const r = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return r.count > 0;
}
