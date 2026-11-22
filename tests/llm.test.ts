/**
 * Адаптер модели (src/server/ai/llm.ts): без ключа — режим правил; GigaChat — обмен ключа авторизации на токен,
 * кэш токена, повтор при 401; шлюз — Bearer-ключ. Сеть подменена, внешних запросов нет.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiProvider, chatComplete, gigachatBasic, resetLlmState } from "@/server/ai/llm";

const KEYS = ["AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "GIGACHAT_AUTH_KEY", "GIGACHAT_SCOPE", "GIGACHAT_CA_FILE", "GIGACHAT_OAUTH_URL", "GIGACHAT_API_URL"];
const saved: Record<string, string | undefined> = {};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const reply = (text: string) => ok({ choices: [{ message: { content: text } }] });

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetLlmState();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("выбор провайдера", () => {
  it("без ключей — режим правил, сеть не трогаем", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(aiProvider()).toBeNull();
    process.env.AI_PROVIDER = "gigachat";
    expect(aiProvider()).toBeNull(); // нет ключа и модели
    expect(await chatComplete([{ role: "user", content: "привет" }])).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("ключ авторизации: «Basic …» и пара id:secret приводятся к base64", () => {
    expect(gigachatBasic("Basic abc==")).toBe("abc==");
    expect(gigachatBasic("id:secret")).toBe(Buffer.from("id:secret").toString("base64"));
  });
});

describe("GigaChat", () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = "gigachat";
    process.env.GIGACHAT_AUTH_KEY = "dGVzdDp0ZXN0";
    process.env.GIGACHAT_SCOPE = "GIGACHAT_API_B2B";
    process.env.AI_MODEL = "GigaChat";
  });

  it("получает токен по ключу, кэширует его и отвечает текстом модели", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return url.includes("/oauth") ? ok({ access_token: "tok-1", expires_at: Date.now() + 30 * 60_000 }) : reply("Здравствуйте!");
      }),
    );
    expect(await chatComplete([{ role: "user", content: "привет" }], { temperature: 0 })).toBe("Здравствуйте!");
    expect(await chatComplete([{ role: "user", content: "ещё" }])).toBe("Здравствуйте!");
    const oauth = calls.filter((c) => c.url.includes("/oauth"));
    expect(oauth).toHaveLength(1); // токен переиспользован
    const h = oauth[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Basic dGVzdDp0ZXN0");
    expect(h.RqUID).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(oauth[0].init.body)).toBe("scope=GIGACHAT_API_B2B");
    const chat = calls.find((c) => c.url.endsWith("/chat/completions"))!;
    expect((chat.init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    const body = JSON.parse(String(chat.init.body));
    expect(body.model).toBe("GigaChat");
    expect(body.temperature).toBeGreaterThan(0); // GigaChat не принимает 0
  });

  it("при 401 берёт новый токен и повторяет один раз", async () => {
    let n = 0, chats = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/oauth")) return ok({ access_token: `tok-${++n}`, expires_at: Date.now() + 30 * 60_000 });
        return ++chats === 1 ? new Response("{}", { status: 401 }) : reply("ok");
      }),
    );
    expect(await chatComplete([{ role: "user", content: "x" }])).toBe("ok");
    expect(n).toBe(2);
  });

  it("неверный ключ или сбой сети — null (помощник уходит в правила), ошибка не пробрасывается", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await chatComplete([{ role: "user", content: "x" }])).toBeNull();
    resetLlmState();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await chatComplete([{ role: "user", content: "x" }])).toBeNull();
  });
});

describe("шлюз (OpenAI-совместимый)", () => {
  it("Bearer-ключ и адрес из .env", async () => {
    Object.assign(process.env, { AI_PROVIDER: "gateway", AI_BASE_URL: "https://gw.example/v1/", AI_API_KEY: "k", AI_MODEL: "m" });
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => reply("да"));
    vi.stubGlobal("fetch", f);
    expect(await chatComplete([{ role: "user", content: "x" }])).toBe("да");
    expect(f.mock.calls[0][0]).toBe("https://gw.example/v1/chat/completions");
    expect((f.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer k");
  });
});
