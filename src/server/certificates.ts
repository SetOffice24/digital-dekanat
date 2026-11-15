import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { university } from "@/config/university";

export type CertificateData = {
  verifyCode: string;
  issuedAt: Date;
  validUntil: Date;
  request: {
    number: number;
    payload: unknown;
    type: { code: string };
    student: {
      lastName: string; firstName: string; middleName: string | null; course: number;
      faculty: { name: string }; program: { name: string; code: string }; group: { name: string };
    };
  };
};

const fontDir = path.join(process.cwd(), "public", "fonts");
let fontBytes: Promise<[Buffer, Buffer]> | null = null;
const loadFonts = () => (fontBytes ??= Promise.all([fs.readFile(path.join(fontDir, "PTSans-Regular.ttf")), fs.readFile(path.join(fontDir, "PTSans-Bold.ttf"))]));

// Intl уже добавляет « г.» в конце
const fmt = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: university.timezone, day: "numeric", month: "long", year: "numeric" }).format(d);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const SCHOLARSHIP_AMOUNT = "3 500 (три тысячи пятьсот) рублей в месяц";

export function certificateBody(c: CertificateData): string {
  const s = c.request.student;
  const fio = [s.lastName, s.firstName, s.middleName].filter(Boolean).join(" ");
  const lead = `Настоящая справка подтверждает, что ${fio} является студентом Университета «${university.name}»: ${s.course} курс, ${s.faculty.name.toLowerCase()}, направление ${s.program.code} «${s.program.name}», группа ${s.group.name}, очная форма обучения.`;
  const p = (c.request.payload ?? {}) as Record<string, unknown>;
  switch (c.request.type.code) {
    case "CERT_MILITARY":
      return `${lead}\nНормативный срок обучения по программе — 4 года. Справка выдана для предоставления в военный комиссариат${typeof p.commissariat === "string" && p.commissariat ? ` (${p.commissariat})` : ""}.`;
    case "CERT_SCHOLARSHIP":
      return `${lead}\nСтудент получает государственную академическую стипендию в размере ${SCHOLARSHIP_AMOUNT}${typeof p.period === "string" && p.period ? `. Справка подтверждает выплаты за период: ${p.period}` : ""}.`;
    default:
      return lead;
  }
}

export async function renderCertificatePdf(c: CertificateData): Promise<Uint8Array> {
  const [regBytes, boldBytes] = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Справка № ${c.request.number}`);
  pdf.setProducer(university.product);
  const reg = await pdf.embedFont(regBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const page = pdf.addPage([595.28, 841.89]);
  const M = 56, W = page.getWidth() - M * 2;
  const ink = rgb(0.06, 0.09, 0.16), accent = rgb(0.06, 0.46, 0.43), grey = rgb(0.36, 0.4, 0.46);

  const center = (t: string, y: number, f: PDFFont, size: number, color = ink) =>
    page.drawText(t, { x: (page.getWidth() - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color });

  center(university.fullName, 780, bold, 18, accent);
  center("Деканат · документ в электронном виде", 762, reg, 10, grey);
  page.drawLine({ start: { x: M, y: 748 }, end: { x: M + W, y: 748 }, thickness: 1.2, color: accent });

  center(`СПРАВКА № ${c.request.number}`, 700, bold, 22);
  center(`от ${fmt(c.issuedAt)}`, 680, reg, 11, grey);

  let y = 630;
  const draw = (text: string, f: PDFFont, size: number, color = ink, lh = size * 1.55) => {
    for (const line of wrap(text, f, size, W)) { page.drawText(line, { x: M, y, size, font: f, color }); y -= lh; }
  };
  for (const para of certificateBody(c).split("\n")) { draw(para, reg, 13); y -= 6; }
  const place = (c.request.payload as Record<string, unknown> | null)?.place;
  if (typeof place === "string" && place.trim()) { y -= 6; draw(`Выдана для предоставления: ${place.trim()}`, reg, 13); }
  y -= 8;
  draw(`Справка действительна до ${fmt(c.validUntil)}`, reg, 11, grey);

  // QR
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${appUrl}/verify/${c.verifyCode}`;
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 1, width: 300, errorCorrectionLevel: "M" }));
  const qrSize = 110, qrY = 150;
  page.drawImage(qr, { x: M, y: qrY, width: qrSize, height: qrSize });
  const tx = M + qrSize + 16;
  const side = (t: string, yy: number, f: PDFFont, size: number, color = ink) => page.drawText(t, { x: tx, y: yy, size, font: f, color });
  side("Проверка подлинности", qrY + 90, bold, 12);
  let ty = qrY + 72;
  for (const l of wrap("Документ сформирован в электронном виде. Подлинность проверяется по QR-коду или по адресу:", reg, 10.5, W - qrSize - 16)) { side(l, ty, reg, 10.5, grey); ty -= 14; }
  for (const l of wrap(url, reg, 10, W - qrSize - 16)) { side(l, ty, reg, 10, accent); ty -= 13; }
  side(`Код: ${c.verifyCode}`, ty - 2, bold, 10.5);

  page.drawLine({ start: { x: M, y: 90 }, end: { x: M + W, y: 90 }, thickness: 0.6, color: grey });
  center("Концепт для конкурса — не является официальным документом. Все данные вымышленные.", 72, reg, 8.5, grey);
  return pdf.save();
}
