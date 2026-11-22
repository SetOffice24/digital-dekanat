/**
 * Единая точка вызова языковой модели для помощника, посещаемости и черновиков.
 *
 * Провайдеры (AI_PROVIDER в .env):
 *  - "gateway"  — OpenAI-совместимый шлюз: AI_BASE_URL, AI_API_KEY, AI_MODEL;
 *  - "gigachat" — GigaChat (Сбер): GIGACHAT_AUTH_KEY (ключ авторизации из личного кабинета),
 *                 GIGACHAT_SCOPE, AI_MODEL; при необходимости GIGACHAT_CA_FILE — сертификат НУЦ Минцифры;
 *  - иначе (или без ключа, или при любой ошибке) — null, и вызывающий код работает по правилам.
 *
 * Ключи читаются только на сервере и никогда не попадают в браузер, логи и ответы.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmOptions = { temperature?: number; maxTokens?: number; timeoutMs?: number };

const GIGACHAT_OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1";

/** Какой провайдер включён и настроен; null — режим правил. */
export function aiProvider(env: NodeJS.ProcessEnv = process.env): "gateway" | "gigachat" | null {
  if (env.AI_PROVIDER === "gateway" && env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL) return "gateway";
  if (env.AI_PROVIDER === "gigachat" && env.GIGACHAT_AUTH_KEY && env.AI_MODEL) return "gigachat";
  return null;
}

/* ---------- HTTP: обычный fetch или https с доверенным сертификатом Минцифры ---------- */

type HttpResult = { status: number; json: () => unknown };

let caCache: { file: string; ca: string[] } | null = null;
function extraCa(file: string | undefined) {
  if (!file) return null;
  if (caCache?.file !== file) caCache = { file, ca: [...rootCertificates, readFileSync(file, "utf8")] };
  return caCache.ca;
}

async function post(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<HttpResult> {
  const ca = extraCa(process.env.GIGACHAT_CA_FILE);
  if (!ca || !url.includes("sberbank.ru")) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
      const text = await res.text();
      return { status: res.status, json: () => JSON.parse(text) };
    } finally {
      clearTimeout(timer);
    }
  }
  // fetch в Node не принимает свой список корневых сертификатов — для GigaChat с сертификатом идём через https
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) }, ca, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode ?? 0, json: () => JSON.parse(text) });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

/* ---------- GigaChat: временный токен по ключу авторизации ---------- */

let token: { value: string; expiresAt: number } | null = null;
let pending: Promise<string | null> | null = null;

/** Ключ авторизации из кабинета — base64(client_id:client_secret). Допускаем «Basic …» и пару id:secret. */
export function gigachatBasic(raw: string) {
  const k = raw.trim().replace(/^Basic\s+/i, "");
  return k.includes(":") ? Buffer.from(k).toString("base64") : k;
}

async function fetchToken(): Promise<string | null> {
  const res = await post(
    process.env.GIGACHAT_OAUTH_URL || GIGACHAT_OAUTH_URL,
    { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", RqUID: randomUUID(), Authorization: `Basic ${gigachatBasic(process.env.GIGACHAT_AUTH_KEY ?? "")}` },
    new URLSearchParams({ scope: process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS" }).toString(),
    15000,
  );
  if (res.status !== 200) {
    console.error("GigaChat OAuth HTTP", res.status);
    return null;
  }
  const data = res.json() as { access_token?: string; expires_at?: number };
  if (!data.access_token) return null;
  // токен живёт ~30 минут; обновляем за минуту до истечения
  const expiresAt = typeof data.expires_at === "number" ? (data.expires_at < 1e12 ? data.expires_at * 1000 : data.expires_at) : Date.now() + 25 * 60_000;
  token = { value: data.access_token, expiresAt };
  return token.value;
}

async function gigachatToken(force = false): Promise<string | null> {
  if (!force && token && token.expiresAt - 60_000 > Date.now()) return token.value;
  // параллельные запросы ждут один и тот же обмен ключа на токен
  pending ??= fetchToken().finally(() => (pending = null));
  return pending;
}

/** Для тестов: сбросить кэш токена. */
export function resetLlmState() {
  token = null;
  pending = null;
  caCache = null;
}

/* ---------- вызов модели ---------- */

/**
 * Ответ модели (текст первого варианта) или null — тогда вызывающий код работает по правилам.
 * Ошибки не пробрасываются: помощник не должен ломаться из-за внешнего сервиса.
 */
export async function chatComplete(messages: LlmMessage[], o: LlmOptions = {}): Promise<string | null> {
  const provider = aiProvider();
  if (!provider) return null;
  const timeoutMs = o.timeoutMs ?? 30000;
  const body = (temperature: number | undefined) => JSON.stringify({ model: process.env.AI_MODEL, temperature, max_tokens: o.maxTokens ?? 800, messages });
  try {
    if (provider === "gateway") {
      const res = await post(`${process.env.AI_BASE_URL!.replace(/\/$/, "")}/chat/completions`, { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` }, body(o.temperature ?? 0.3), timeoutMs);
      if (res.status !== 200) {
        console.error("AI gateway HTTP", res.status);
        return null;
      }
      return contentOf(res.json());
    }
    // GigaChat: температура должна быть > 0 — для «строгих» задач берём минимальную
    const t = Math.max(o.temperature ?? 0.3, 0.01);
    const url = `${(process.env.GIGACHAT_API_URL || GIGACHAT_API_URL).replace(/\/$/, "")}/chat/completions`;
    for (const force of [false, true]) {
      const access = await gigachatToken(force);
      if (!access) return null;
      const res = await post(url, { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${access}` }, body(t), timeoutMs);
      if (res.status === 401 && !force) continue; // токен отозван/истёк раньше срока — один повтор с новым
      if (res.status !== 200) {
        console.error("GigaChat HTTP", res.status);
        return null;
      }
      return contentOf(res.json());
    }
    return null;
  } catch (e) {
    console.error(provider === "gigachat" ? "GigaChat error" : "AI gateway error", (e as Error).name, (e as Error).message?.slice(0, 120));
    return null;
  }
}

function contentOf(data: unknown): string | null {
  const content = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  return typeof content === "string" && content ? content : null;
}
