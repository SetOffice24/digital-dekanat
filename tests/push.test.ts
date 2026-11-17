/**
 * Подписки на push: принимаем только корректные, удалить можно только свою. Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type User } from "@prisma/client";
import { removePushSubscription, savePushSubscription } from "@/server/push";

const db = new PrismaClient();
let anna: User, petr: User;
const endpoint = `https://push.example.test/sub/${Date.now()}`;
const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

beforeAll(async () => {
  anna = await db.user.findUniqueOrThrow({ where: { login: "anna.lesnova" } });
  petr = await db.user.findUniqueOrThrow({ where: { login: "petr.ozerov" } });
});
afterAll(async () => {
  await db.pushSubscription.deleteMany({ where: { endpoint: { startsWith: "https://push.example.test/" } } });
  await db.$disconnect();
});

describe("подписки на push", () => {
  it("корректная подписка сохраняется за пользователем", async () => {
    expect(await savePushSubscription(anna.id, { endpoint, keys }, "test")).toBe(true);
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).userId).toBe(anna.id);
  });

  it("не https, мусор в ключах и слишком длинный адрес — отказ", async () => {
    expect(await savePushSubscription(anna.id, { endpoint: "http://evil.test/x", keys }, null)).toBe(false);
    expect(await savePushSubscription(anna.id, { endpoint: endpoint + "2", keys: { p256dh: "<script>", auth: keys.auth } }, null)).toBe(false);
    expect(await savePushSubscription(anna.id, { endpoint: "https://x.test/" + "a".repeat(1100), keys }, null)).toBe(false);
  });

  it("чужой endpoint с другими ключами не перехватить; тот же браузер (те же ключи) — можно", async () => {
    const other = { p256dh: keys.p256dh.slice(0, -4) + "AAAA", auth: "AAAAAAAAAAAAAAAAAAAAAA" };
    expect(await savePushSubscription(petr.id, { endpoint, keys: other }, null)).toBe(false);
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).userId).toBe(anna.id);
    // вошли в том же браузере под другим аккаунтом и вернулись — ключи совпадают
    expect(await savePushSubscription(petr.id, { endpoint, keys }, null)).toBe(true);
    expect(await savePushSubscription(anna.id, { endpoint, keys }, null)).toBe(true);
  });

  it("чужую подписку удалить нельзя, свою — можно", async () => {
    expect(await removePushSubscription(petr.id, endpoint)).toBe(false);
    expect(await db.pushSubscription.count({ where: { endpoint } })).toBe(1);
    expect(await removePushSubscription(anna.id, endpoint)).toBe(true);
    expect(await db.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });
});
