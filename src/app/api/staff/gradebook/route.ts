import ExcelJS from "exceljs";
import { getCurrentUser } from "@/server/auth";
import { groupGradebook } from "@/server/repos/analytics";
import { forecastLabel } from "@/lib/grading";

export const runtime = "nodejs";

const GRADE: Record<string, string> = { "5": "5", "4": "4", "3": "3", "2": "2", PASS: "зачтено", FAIL: "не зачтено" };

/** Выгрузка сводной ведомости группы в Excel — только для деканата и только своей области доступа. */
export async function GET(req: Request) {
  const notFound = () => new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user || user.role !== "STAFF" || !user.staff) return notFound();
  const url = new URL(req.url);
  const groupId = url.searchParams.get("group") ?? "";
  if (!/^[a-z0-9]{1,40}$/i.test(groupId)) return notFound();
  const gb = await groupGradebook(user.staff, groupId, Number(url.searchParams.get("sem")) || undefined);
  if (!gb) return notFound();
  const current = gb.semester === gb.curSem;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Универ — цифровой деканат (концепт для конкурса)";
  const ws = wb.addWorksheet(`${gb.group.name} · ${gb.semester} сем`);
  ws.addRow([`Сводная ведомость · ${gb.group.name} · ${gb.semester} семестр${current ? " (текущий)" : ""}`]).font = { bold: true, size: 13 };
  ws.addRow([`${gb.group.program.name}, ${gb.group.course} курс. Выгружено ${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long", timeStyle: "short" }).format(new Date())}`]);
  ws.addRow([current ? "В ячейках: баллы / возможные на сегодня и прогноз оценки (60% — «3», 75% — «4», 90% — «5»)." : "В ячейках: итоговые оценки семестра."]);
  ws.addRow([]);
  const header = ws.addRow(["№", "Студент", ...gb.courses.map((c) => c.name), "Средний балл", "Долги", "Посещаемость, %", "ДЗ сдано"]);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };
  gb.rows.forEach((r, i) => {
    const cells = gb.courses.map((c) => {
      const cell = r.cells[c.id];
      if (!cell) return "—";
      if (cell.kind === "final") return cell.value ? (GRADE[cell.value] ?? cell.value) : "—";
      return cell.forecast ? `${cell.points}/${cell.max} · ${forecastLabel(cell.forecast)}` : "нет оценок";
    });
    const row = ws.addRow([i + 1, r.fullName, ...cells, r.avg != null ? Number(r.avg.toFixed(2)) : "—", r.debts, r.attendance ?? "—", r.homework.due ? `${r.homework.done} из ${r.homework.due}` : "—"]);
    if (r.debts > 0) row.getCell(gb.courses.length + 4).font = { bold: true, color: { argb: "FFC43D2B" } };
  });
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 34;
  for (let i = 0; i < gb.courses.length; i++) ws.getColumn(3 + i).width = 18;
  for (let i = 0; i < 4; i++) ws.getColumn(3 + gb.courses.length + i).width = 14;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 5 }];
  ws.addRow([]);
  ws.addRow(["Концепт для конкурса — не официальный документ. Все данные вымышленные."]).font = { italic: true, color: { argb: "FF777777" } };

  const buf = await wb.xlsx.writeBuffer();
  const name = `Ведомость ${gb.group.name} ${gb.semester} семестр.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
