/**
 * Поиск во «входящих» деканата и кнопка «Следующая заявка». Требует засеянную БД.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Staff } from "@prisma/client";
import { countByStatus, listRequests, nextOpenRequest } from "@/server/repos/staff";

const db = new PrismaClient();
let staff: Staff;

beforeAll(async () => {
  staff = await db.staff.findFirstOrThrow({ where: { user: { login: "dekanat" } } });
});
afterAll(() => db.$disconnect());

describe("поиск заявок деканатом", () => {
  it("по фамилии без учёта регистра", async () => {
    const rows = await listRequests(staff, { q: "озеров" }); // строчными и через «е»
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.student.lastName === "Озёров")).toBe(true);
  });

  it("по номеру, в том числе с «№»", async () => {
    const any = await db.request.findFirstOrThrow();
    const rows = await listRequests(staff, { q: `№ ${any.number}` });
    expect(rows.map((r) => r.id)).toContain(any.id);
  });

  it("по группе и фамилии сразу; счётчики вкладок считают только найденное", async () => {
    const rows = await listRequests(staff, { q: "ЭК-23-2 Озёров" });
    expect(rows.every((r) => r.student.group.name === "ЭК-23-2")).toBe(true);
    const counts = await countByStatus(staff, { q: "ЭК-23-2 Озёров" });
    expect(Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)).toBe(rows.length);
  });

  it("огромное число и мусор не ломают запрос", async () => {
    expect(await listRequests(staff, { q: "99999999999999999999" })).toEqual([]);
    expect(await listRequests(staff, { q: "'; DROP TABLE x; --" })).toEqual([]);
  });

  it("следующая заявка — открытая и не текущая", async () => {
    const cur = await db.request.findFirstOrThrow({ where: { status: "NEW" } });
    const next = await nextOpenRequest(staff, cur.id);
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(cur.id);
    const full = await db.request.findUniqueOrThrow({ where: { id: next!.id } });
    expect(["NEW", "IN_REVIEW"]).toContain(full.status);
  });
});
