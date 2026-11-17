/**
 * Демо-фото для документов и коды электронных студенческих.
 * Фото — нарисованные силуэты (не реальные люди): принятые у Анны и части её группы, у Петра — новое на проверке.
 * Вызывается из seed.ts после создания студентов.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { PrismaClient } from "@prisma/client";

type Ctx = { prisma: PrismaClient; now: Date; annaId: string; petrId: string; annaGroupId: string; staffUserId: string; rng: () => number };

const dir = () => path.join(process.env.DATA_DIR || "./data", "photos");
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from(randomBytes(10), (b) => ABC[b % ABC.length]).join("");

const SKIN = ["#f1c7a8", "#e0ac8a", "#c98e6b", "#f5d5bd"];
const HAIR = ["#2b1d14", "#5a3a22", "#8a5a2b", "#c9a26b", "#1c1c1c"];
const SHIRT = ["#3d4a6b", "#5b6b4a", "#6b3d4a", "#2f3a3f", "#7a6a55"];

/** Портрет-иллюстрация 600×800 на светлом фоне — как фото на документы, но заведомо не человек. */
function portrait(rng: () => number, longHair: boolean) {
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const skin = pick(SKIN);
  const hair = pick(HAIR);
  const shirt = pick(SHIRT);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#eef1f5"/>
  ${longHair ? `<path d="M170 300 Q160 520 200 600 L400 600 Q440 520 430 300 Z" fill="${hair}"/>` : ""}
  <path d="M90 800 Q100 600 300 590 Q500 600 510 800 Z" fill="${shirt}"/>
  <rect x="262" y="480" width="76" height="120" rx="30" fill="${skin}"/>
  <ellipse cx="300" cy="360" rx="122" ry="152" fill="${skin}"/>
  <path d="M178 340 Q175 200 300 196 Q425 200 422 340 Q400 260 300 262 Q200 260 178 340 Z" fill="${hair}"/>
  <ellipse cx="255" cy="365" rx="9" ry="7" fill="#2a2a2a"/>
  <ellipse cx="345" cy="365" rx="9" ry="7" fill="#2a2a2a"/>
  <path d="M268 440 Q300 458 332 440" stroke="#9a5a4a" stroke-width="6" fill="none" stroke-linecap="round"/>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

export async function seedPhotos(c: Ctx) {
  const { prisma } = c;
  await fs.rm(dir(), { recursive: true, force: true });
  await fs.mkdir(dir(), { recursive: true });

  // коды электронных студенческих — у всех
  const all = await prisma.student.findMany({ select: { id: true } });
  for (const s of all) await prisma.student.update({ where: { id: s.id }, data: { idCode: code() } });

  const ago = (d: number) => new Date(c.now.getTime() - d * 86400_000);
  const add = async (studentId: string, status: "APPROVED" | "PENDING", days: number, longHair: boolean) => {
    const jpeg = await portrait(c.rng, longHair);
    const storageKey = randomBytes(18).toString("hex");
    await fs.writeFile(path.join(dir(), storageKey), jpeg);
    await prisma.studentPhoto.create({
      data: { studentId, storageKey, size: jpeg.length, status, createdAt: ago(days), ...(status === "APPROVED" ? { reviewedAt: ago(days - 1), reviewedById: c.staffUserId } : {}) },
    });
  };

  await add(c.annaId, "APPROVED", 60, true);
  await add(c.petrId, "PENDING", 1, false);
  // часть одногруппников Анны — с фото; у остальных его нет (видно в «Студенты → Фото»)
  const mates = await prisma.student.findMany({ where: { groupId: c.annaGroupId, id: { not: c.annaId } }, orderBy: { lastName: "asc" }, select: { id: true, middleName: true } });
  for (const [i, m] of mates.entries()) {
    const female = /на$/.test(m.middleName ?? "");
    if (i % 3 !== 2) await add(m.id, "APPROVED", 50 - i, female);
    else if (i === 2) await add(m.id, "PENDING", 0.2, female);
  }
}
