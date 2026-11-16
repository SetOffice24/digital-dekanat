/**
 * Демо-данные: материалы, домашние задания и сдачи (с настоящими файлами в DATA_DIR/uploads).
 * Вызывается из seed.ts после создания пользователей и расписания.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { PrismaClient, SubmissionStatus } from "@prisma/client";

type Ctx = {
  prisma: PrismaClient;
  now: Date;
  groups: Record<string, { id: string }>;
  demoTeacherId: string;
  teacherUserId: string;
  staffUserId: string;
  annaId: string;
  petrId: string;
  rng: () => number;
};

const dir = () => path.join(process.env.DATA_DIR || "./data", "uploads");
const MIME: Record<string, string> = { md: "text/plain", txt: "text/plain", py: "text/plain", sql: "text/plain", csv: "text/csv" };

async function file(name: string, content: string, uploadedById: string) {
  const storageKey = randomBytes(18).toString("hex");
  const buf = Buffer.from(content, "utf8");
  await fs.writeFile(path.join(dir(), storageKey), buf);
  return { name, mime: MIME[name.split(".").pop()!] ?? "text/plain", size: buf.length, storageKey, uploadedById };
}

export async function seedHomework(c: Ctx) {
  const { prisma, now } = c;
  await fs.rm(dir(), { recursive: true, force: true });
  await fs.mkdir(dir(), { recursive: true });
  const days = (n: number, hh = 23, mm = 59) => {
    const d = new Date(now.getTime() + n * 86400000);
    d.setUTCHours(hh - 3, mm, 0, 0); // время по Москве
    return d;
  };
  // дисциплина группы по названию + её преподаватель (по расписанию)
  const pair = async (group: string, course: string) => {
    const l = await prisma.lesson.findFirstOrThrow({ where: { groupId: c.groups[group].id, course: { name: course } }, select: { courseId: true, teacherId: true } });
    const uploader = l.teacherId === c.demoTeacherId ? c.teacherUserId : c.staffUserId;
    return { groupId: c.groups[group].id, courseId: l.courseId, teacherId: l.teacherId, uploader };
  };

  const algo1 = await pair("ИВТ-24-1", "Алгоритмы и структуры данных");
  const db1 = await pair("ИВТ-24-1", "Базы данных");
  const algo2 = await pair("ИВТ-24-2", "Алгоритмы и структуры данных");
  const econ = await pair("ЭК-23-2", "Эконометрика");
  const fin = await pair("ЭК-23-2", "Корпоративные финансы");

  /* ---------- материалы ---------- */
  const mat = async (p: typeof algo1, title: string, ago: number, opts: { description?: string; url?: string; files?: [string, string][] }) =>
    prisma.material.create({
      data: {
        groupId: p.groupId, courseId: p.courseId, teacherId: p.teacherId, title, description: opts.description, url: opts.url, createdAt: days(-ago, 10, 0),
        files: { create: await Promise.all((opts.files ?? []).map(([n, t]) => file(n, t, p.uploader))) },
      },
    });
  await mat(algo1, "Лекция 6. Деревья поиска", 12, { description: "Бинарные деревья поиска, обходы, удаление узла. Конспект к лабораторной №4.", files: [["Лекция 6 — деревья поиска.md", "# Лекция 6. Деревья поиска\n\n- Определение BST\n- Вставка и поиск: O(h)\n- Удаление узла: три случая\n- Обходы: in-order, pre-order, post-order\n"]] });
  await mat(algo1, "Хеш-таблицы: обзорная статья", 5, { description: "Прочитать перед лабораторной №5.", url: "https://ru.wikipedia.org/wiki/Хеш-таблица" });
  await mat(algo1, "Шаблон отчёта по лабораторной", 20, { files: [["Шаблон отчёта.md", "# Лабораторная работа №_\n\n**Студент:** \n**Группа:** \n\n## Цель\n\n## Решение\n\n## Тесты\n\n## Вывод\n"]] });
  await mat(db1, "Лекция 4. Нормализация", 8, { description: "1НФ, 2НФ, 3НФ на примерах.", files: [["Лекция 4 — нормализация.md", "# Нормализация\n\n1НФ — атомарные значения.\n2НФ — нет частичных зависимостей.\n3НФ — нет транзитивных зависимостей.\n"]] });
  await mat(algo2, "Лекция 6. Деревья поиска", 12, { files: [["Лекция 6 — деревья поиска.md", "# Лекция 6. Деревья поиска\n"]] });
  await mat(econ, "Методичка: парная регрессия", 9, { description: "МНК, коэффициент детерминации, проверка значимости.", files: [["Методичка — регрессия.txt", "Парная линейная регрессия y = a + b·x.\nОценки МНК, R², t-тест для коэффициентов.\n"]] });
  await mat(econ, "Данные для расчёта", 9, { files: [["данные.csv", "x;y\n1;2,1\n2;3,9\n3;6,2\n4;7,8\n5;10,1\n"]] });

  /* ---------- задания и сдачи ---------- */
  const students = async (groupId: string) => prisma.student.findMany({ where: { groupId }, orderBy: { lastName: "asc" }, select: { id: true, userId: true, lastName: true } });

  const assign = async (p: typeof algo1, title: string, description: string, dueDays: number, createdAgo: number, files: [string, string][] = []) =>
    prisma.assignment.create({
      data: {
        groupId: p.groupId, courseId: p.courseId, teacherId: p.teacherId, title, description, dueAt: days(dueDays), createdAt: days(-createdAgo, 12, 0),
        files: { create: await Promise.all(files.map(([n, t]) => file(n, t, p.uploader))) },
      },
    });
  const submit = async (assignmentId: string, st: { id: string; userId: string; lastName: string }, status: SubmissionStatus, submittedAgoDays: number, ext: string, teacherComment?: string, comment?: string) =>
    prisma.submission.create({
      data: {
        assignmentId, studentId: st.id, status, comment, teacherComment, submittedAt: days(-submittedAgoDays, 20, 15), reviewedAt: status === "SUBMITTED" ? null : days(-submittedAgoDays + 1, 11, 0),
        files: { create: [await file(`${st.lastName} — решение.${ext}`, ext === "py" ? "def solve():\n    # решение\n    return 42\n" : ext === "sql" ? "CREATE TABLE book (id serial primary key, title text);\n" : "Расчёт выполнен, вывод: связь значима.\n", st.userId)] },
      },
    });

  // ИВТ-24-1, алгоритмы: прошедшая лабораторная (почти все сдали) и текущая (срок через 2 дня, Анна ещё не сдала)
  const g1 = await students(algo1.groupId);
  const lab4 = await assign(algo1, "Лабораторная №4. Бинарное дерево поиска", "Реализуйте BST: вставка, поиск, удаление, обход in-order. Приложите код и отчёт по шаблону.", -5, 14, [["Условие лабораторной №4.md", "# Лабораторная №4\n\nРеализовать BST с операциями insert, find, remove, inorder.\n"]]);
  for (const [i, st] of g1.entries()) {
    if (st.id === c.annaId) await submit(lab4.id, st, "ACCEPTED", 6, "py", "Отличная работа, удаление реализовано аккуратно.", "Добавила тесты на граничные случаи");
    else if (i % 5 === 3) continue; // не сдали
    else await submit(lab4.id, st, i % 4 === 1 ? "RETURNED" : "ACCEPTED", 6 - (i % 3), "py", i % 4 === 1 ? "Удаление узла с двумя детьми работает неверно — исправьте." : undefined);
  }
  const lab5 = await assign(algo1, "Лабораторная №5. Хеш-таблица", "Реализуйте хеш-таблицу с цепочками: put, get, remove, автоматическое расширение. Сравните время с встроенным dict.", 2, 4, [["Условие лабораторной №5.md", "# Лабораторная №5\n\nХеш-таблица с разрешением коллизий цепочками.\n"]]);
  for (const [i, st] of g1.entries()) if (st.id !== c.annaId && i % 3 === 0) await submit(lab5.id, st, "SUBMITTED", 1, "py");
  const er = await assign(db1, "ER-диаграмма для библиотеки", "Спроектируйте схему БД библиотеки (книги, читатели, выдачи) в 3НФ. Пришлите SQL-скрипт создания таблиц.", 6, 2);
  for (const st of g1.filter((s) => s.id === c.annaId)) await submit(er.id, st, "SUBMITTED", 0, "sql", undefined, "Сделала через serial, можно переделать на uuid");

  // ИВТ-24-2
  const g2 = await students(algo2.groupId);
  const lab5b = await assign(algo2, "Лабораторная №5. Хеш-таблица", "То же задание, что у ИВТ-24-1.", 3, 4);
  for (const [i, st] of g2.entries()) if (i % 2 === 0) await submit(lab5b.id, st, "SUBMITTED", 1, "py");

  // ЭК-23-2: у Петра одно задание на доработке, другое — сдать
  const g3 = await students(econ.groupId);
  const reg = await assign(econ, "Парная регрессия: расчёт в Excel", "По данным из материалов постройте парную регрессию, найдите R² и проверьте значимость коэффициентов.", -1, 8);
  for (const [i, st] of g3.entries()) {
    if (st.id === c.petrId) await submit(reg.id, st, "RETURNED", 2, "txt", "Не хватает проверки значимости коэффициентов (t-тест) и вывода. Дополните и отправьте снова.");
    else if (i % 4 !== 2) await submit(reg.id, st, i % 3 === 0 ? "SUBMITTED" : "ACCEPTED", 2, "txt");
  }
  await assign(fin, "Расчёт NPV инвестиционного проекта", "Рассчитайте NPV и IRR проекта по исходным данным, сделайте вывод о целесообразности.", 4, 1);
}
