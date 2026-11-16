/**
 * Генерация демо-файлов для материалов и домашних заданий (Word, PDF, Excel, PowerPoint).
 * Запускается один раз вручную: `node scripts/make-fixtures.mjs` → prisma/fixtures/*. Готовые файлы лежат в git,
 * сид только копирует их — на сервере эти библиотеки не нужны.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const out = path.resolve("prisma/fixtures");
await fs.mkdir(out, { recursive: true });
const NOTE = "Концепт для конкурса — учебный материал вымышленный.";

/* ---------- Word ---------- */
async function docx(file, title, blocks) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 })];
  for (const b of blocks) {
    if (b.h) children.push(new Paragraph({ text: b.h, heading: HeadingLevel.HEADING_2 }));
    if (b.p) children.push(new Paragraph({ children: [new TextRun(b.p)] }));
    if (b.list) for (const li of b.list) children.push(new Paragraph({ text: li, bullet: { level: 0 } }));
    if (b.table)
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.table.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(String(c))] })) })),
        }),
      );
  }
  children.push(new Paragraph({ children: [new TextRun({ text: NOTE, italics: true, size: 18 })] }));
  const doc = new Document({ creator: "Универ (демо)", title, sections: [{ children }] });
  await fs.writeFile(path.join(out, file), await Packer.toBuffer(doc));
}

/* ---------- PDF (PT Sans — кириллица) ---------- */
async function pdf(file, title, lines) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(await fs.readFile("public/fonts/PTSans-Regular.ttf"), { subset: true });
  const bold = await doc.embedFont(await fs.readFile("public/fonts/PTSans-Bold.ttf"), { subset: true });
  const page = doc.addPage([595.28, 841.89]);
  let y = 780;
  page.drawText(title, { x: 56, y, size: 20, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 36;
  for (const l of lines) {
    const isH = l.startsWith("## ");
    const text = isH ? l.slice(3) : l;
    if (isH) y -= 10; // воздух перед подзаголовком
    page.drawText(text, { x: 56, y, size: isH ? 14 : 11.5, font: isH ? bold : reg, color: rgb(0.1, 0.1, 0.12) });
    y -= isH ? 24 : 18;
  }
  page.drawText(NOTE, { x: 56, y: 60, size: 9, font: reg, color: rgb(0.4, 0.4, 0.45) });
  doc.setTitle(title);
  await fs.writeFile(path.join(out, file), await doc.save());
}

/* ---------- Excel ---------- */
async function xlsx(file, sheet, header, rows, extra) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Универ (демо)";
  const ws = wb.addWorksheet(sheet);
  ws.addRow(header).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => (c.width = 18));
  if (extra) extra(ws);
  ws.addRow([]);
  ws.addRow([NOTE]).font = { italic: true, color: { argb: "FF777777" } };
  await wb.xlsx.writeFile(path.join(out, file));
}

/* ---------- PowerPoint ---------- */
async function pptx(file, title, slides) {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.title = title;
  const s0 = p.addSlide();
  s0.background = { color: "26262B" };
  s0.addText(title, { x: 0.8, y: 2.6, w: 11.5, h: 1.2, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Arial" });
  s0.addText("Университет «Универ» · " + NOTE, { x: 0.8, y: 4, w: 11.5, h: 0.6, fontSize: 14, color: "F4B393", fontFace: "Arial" });
  for (const s of slides) {
    const sl = p.addSlide();
    sl.addText(s.h, { x: 0.8, y: 0.5, w: 11.5, h: 0.9, fontSize: 30, bold: true, color: "26262B", fontFace: "Arial" });
    sl.addText(s.points.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.8, y: 1.6, w: 11.5, h: 4.8, fontSize: 20, color: "333333", fontFace: "Arial", valign: "top" });
  }
  await p.writeFile({ fileName: path.join(out, file) });
}

/* ---------- сами файлы ---------- */
await pdf("lecture6-bst.pdf", "Лекция 6. Деревья поиска", [
  "## Определение",
  "Бинарное дерево поиска (BST): левое поддерево < ключ < правое поддерево.",
  "## Операции",
  "Поиск и вставка — O(h), где h — высота дерева.",
  "Удаление узла: нет детей; один ребёнок; два ребёнка (замена на минимум справа).",
  "## Обходы",
  "In-order даёт ключи по возрастанию. Pre-order и post-order — для копирования и удаления.",
]);
await docx("report-template.docx", "Отчёт по лабораторной работе №__", [
  { p: "Студент: ______________________   Группа: ________" },
  { h: "1. Цель работы", p: "Кратко опишите, что нужно было сделать." },
  { h: "2. Решение", p: "Опишите алгоритм и ключевые фрагменты кода." },
  { h: "3. Тестирование", table: [["Входные данные", "Ожидаемый результат", "Фактический результат"], ["", "", ""], ["", "", ""]] },
  { h: "4. Вывод", p: "Что получилось, что можно улучшить." },
]);
await docx("lab4-task.docx", "Лабораторная работа №4. Бинарное дерево поиска", [
  { h: "Задание", list: ["Реализовать вставку, поиск и удаление узла.", "Реализовать обход in-order.", "Покрыть тестами граничные случаи."] },
  { h: "Что сдать", p: "Отчёт по шаблону (Word или PDF) с кодом и результатами тестов." },
]);
await docx("lab5-task.docx", "Лабораторная работа №5. Хеш-таблица", [
  { h: "Задание", list: ["Хеш-таблица с цепочками: put, get, remove.", "Автоматическое расширение при заполнении более 75%.", "Сравнить время работы со встроенным словарём."] },
  { h: "Что сдать", p: "Отчёт по шаблону и таблицу замеров времени (Excel)." },
]);
await pptx("lecture4-normalization.pptx", "Лекция 4. Нормализация", [
  { h: "Зачем нормализовать", points: ["Убираем дублирование данных", "Избегаем аномалий вставки, обновления и удаления"] },
  { h: "Нормальные формы", points: ["1НФ — атомарные значения", "2НФ — нет частичных зависимостей от ключа", "3НФ — нет транзитивных зависимостей"] },
  { h: "Пример", points: ["Книги, читатели, выдачи — три таблицы", "Выдача ссылается на книгу и читателя"] },
]);
await pdf("regression-guide.pdf", "Методичка: парная линейная регрессия", [
  "## Модель",
  "y = a + b·x + e. Параметры a и b оцениваются методом наименьших квадратов.",
  "## Качество модели",
  "Коэффициент детерминации R² показывает долю объяснённой дисперсии.",
  "## Значимость",
  "t-тест для коэффициентов: |t| > t-критического — коэффициент значим.",
  "## Оформление",
  "Расчёт в Excel, вывод — в Word или PDF.",
]);
await xlsx("regression-data.xlsx", "Данные", ["x (тыс. руб.)", "y (тыс. шт.)"], [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1], [6, 11.8], [7, 14.2]]);
await docx("solution.docx", "Решение лабораторной работы", [
  { h: "Решение", p: "Реализованы все требуемые операции, код приложен в отчёте." },
  { h: "Тесты", table: [["Тест", "Результат"], ["Пустая структура", "OK"], ["Граничные значения", "OK"]] },
  { h: "Вывод", p: "Все операции работают за ожидаемое время." },
]);
await xlsx("regression-calc.xlsx", "Расчёт", ["x", "y", "x·y", "x²"], [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]].map(([x, y]) => [x, y, +(x * y).toFixed(2), x * x]), (ws) => {
  ws.addRow([]);
  ws.addRow(["b", "", "", 1.99]);
  ws.addRow(["a", "", "", 0.03]);
  ws.addRow(["R²", "", "", 0.996]);
});
await pdf("er-diagram.pdf", "ER-диаграмма: библиотека", [
  "## Сущности",
  "Книга (id, название, автор, год)",
  "Читатель (id, ФИО, билет)",
  "Выдача (id, книга → Книга, читатель → Читатель, дата выдачи, дата возврата)",
  "## Нормальная форма",
  "Схема в 3НФ: нет повторяющихся групп и транзитивных зависимостей.",
]);

console.log("fixtures:", (await fs.readdir(out)).join(", "));
