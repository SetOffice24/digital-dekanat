/**
 * Сид вымышленных данных «Универа». Детерминированный (seedrandom), даты — относительно момента запуска.
 * Все ФИО, номера зачёток и прочее — вымышленные.
 */
import { PrismaClient, type Prisma, type LessonKind, type Assessment } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import seedrandom from "seedrandom";
import { customAlphabet } from "nanoid";

const prisma = new PrismaClient();
const rng = seedrandom("univer-demo");
const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const verifyCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/* ---------- даты ---------- */
const now = new Date();
const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
/** Понедельник текущей недели (UTC-дата) */
const monday = addDays(todayUTC, -((todayUTC.getUTCDay() + 6) % 7));
const at = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - 3, m)); // МСК = UTC+3
};

const BELLS = [
  ["08:30", "10:00"],
  ["10:10", "11:40"],
  ["12:20", "13:50"],
  ["14:00", "15:30"],
  ["15:40", "17:10"],
  ["17:20", "18:50"],
] as const;

/* ---------- имена (вымышленные сочетания) ---------- */
const maleFirst = ["Артём", "Илья", "Максим", "Никита", "Егор", "Даниил", "Кирилл", "Матвей", "Тимофей", "Глеб"];
const femaleFirst = ["Алина", "Полина", "Вероника", "Ксения", "Дарья", "Софья", "Милана", "Ульяна", "Ева", "Злата"];
const lastBase = ["Лесков", "Брусницын", "Ольхов", "Таволгин", "Жаворонков", "Снегирёв", "Рябинин", "Клёнов", "Вереск", "Ракитин", "Черёмухин", "Зорин"];
const maleMiddle = ["Андреевич", "Олегович", "Сергеевич", "Игоревич", "Павлович"];
const femaleMiddle = ["Андреевна", "Олеговна", "Сергеевна", "Игоревна", "Павловна"];
function person(female: boolean) {
  const base = pick(lastBase);
  const last = female ? (base.endsWith("ск") || base === "Вереск" ? base : base + "а") : base;
  return { lastName: last, firstName: pick(female ? femaleFirst : maleFirst), middleName: pick(female ? femaleMiddle : maleMiddle) };
}
const teacherNames = [
  "Ковыль Г. А.", "Миронова Е. В.", "Ширяев Д. Л.", "Остапенко Н. С.", "Лазарева И. М.", "Голубев П. Р.",
  "Ефремова Т. Ю.", "Берестов А. К.", "Соколова-Ветрова М. Д.", "Аксёнов В. В.", "Туманова Л. Г.", "Федосеев К. И.",
  "Родионова С. А.", "Яхонтов Б. Е.", "Крылова О. П.", "Зимин Р. Н.", "Полевая А. С.", "Дубравин М. М.",
];

/* ---------- структура вуза ---------- */
type CourseDef = { name: string; assessment: Assessment };
const C = (name: string, assessment: Assessment = "EXAM"): CourseDef => ({ name, assessment });

const structure = [
  {
    name: "Факультет информационных технологий", short: "ФИТ",
    programs: [
      {
        name: "Информатика и вычислительная техника", code: "09.03.01",
        groups: [{ name: "ИВТ-24-1", course: 2 }, { name: "ИВТ-24-2", course: 2 }, { name: "ИВТ-23-1", course: 3 }],
        current: [C("Алгоритмы и структуры данных"), C("Базы данных"), C("Операционные системы"), C("Дискретная математика"), C("Английский язык", "CREDIT"), C("Физическая культура", "CREDIT")],
        past: [
          [C("Математический анализ"), C("Программирование на Python"), C("История России", "CREDIT"), C("Линейная алгебра"), C("Введение в специальность", "CREDIT")],
          [C("Объектно-ориентированное программирование"), C("Физика"), C("Теория вероятностей"), C("Философия", "CREDIT"), C("Учебная практика", "GRADED_CREDIT")],
        ],
      },
      {
        name: "Прикладная информатика", code: "09.03.03",
        groups: [{ name: "ПИ-25-1", course: 1 }],
        current: [C("Математический анализ"), C("Основы программирования"), C("История России", "CREDIT"), C("Английский язык", "CREDIT"), C("Цифровая грамотность", "CREDIT")],
        past: [],
      },
    ],
  },
  {
    name: "Экономический факультет", short: "ЭФ",
    programs: [
      {
        name: "Экономика", code: "38.03.01",
        groups: [{ name: "ЭК-23-1", course: 3 }, { name: "ЭК-23-2", course: 3 }],
        current: [C("Эконометрика"), C("Корпоративные финансы"), C("Налоги и налогообложение"), C("Маркетинг", "GRADED_CREDIT"), C("Курсовая работа по финансам", "COURSEWORK"), C("Английский язык (деловой)", "CREDIT")],
        past: [
          [C("Микроэкономика"), C("Высшая математика"), C("История России", "CREDIT"), C("Информатика", "CREDIT"), C("Введение в экономику", "CREDIT")],
          [C("Макроэкономика"), C("Статистика"), C("Бухгалтерский учёт"), C("Философия", "CREDIT"), C("Правоведение", "CREDIT")],
          [C("Мировая экономика"), C("Финансы"), C("Теория вероятностей"), C("Менеджмент", "GRADED_CREDIT"), C("Социология", "CREDIT")],
          [C("Деньги, кредит, банки"), C("Экономика организаций"), C("Методы оптимальных решений"), C("Учебная практика", "GRADED_CREDIT"), C("Психология", "CREDIT")],
        ],
      },
      {
        name: "Менеджмент", code: "38.03.02",
        groups: [{ name: "МН-24-1", course: 2 }],
        current: [C("Теория менеджмента"), C("Маркетинг"), C("Статистика"), C("Английский язык", "CREDIT"), C("Физическая культура", "CREDIT")],
        past: [],
      },
    ],
  },
  {
    name: "Гуманитарный факультет", short: "ГФ",
    programs: [
      {
        name: "Журналистика", code: "42.03.02",
        groups: [{ name: "ЖР-24-1", course: 2 }],
        current: [C("Теория журналистики"), C("Медиапроектирование", "GRADED_CREDIT"), C("Стилистика и литературное редактирование"), C("Английский язык", "CREDIT")],
        past: [],
      },
      {
        name: "Лингвистика", code: "45.03.02",
        groups: [{ name: "ЛН-25-1", course: 1 }],
        current: [C("Введение в языкознание"), C("Практический курс английского языка"), C("Латинский язык", "CREDIT"), C("История России", "CREDIT")],
        past: [],
      },
    ],
  },
] as const;

const rooms = ["101", "105", "112", "204", "215", "301", "306", "312", "401", "418", "Ауд. А-1", "Лаб. 3"];
const buildings = ["Главный корпус", "Корпус Б", "Корпус В"];

async function reset() {
  // порядок удаления с учётом связей
  await prisma.aiMessage.deleteMany();
  await prisma.aiChat.deleteMany();
  await prisma.wellbeingCheckin.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.requestEvent.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  await prisma.deadline.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.course.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.session.deleteMany();
  await prisma.student.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.user.deleteMany();
  await prisma.group.deleteMany();
  await prisma.program.deleteMany();
  await prisma.faculty.deleteMany();
}

async function main() {
  await reset();

  const teachers = await Promise.all(
    teacherNames.map((fullName, i) =>
      prisma.teacher.create({ data: { fullName, department: ["Кафедра прикладной математики", "Кафедра информатики", "Кафедра экономики", "Кафедра иностранных языков", "Кафедра гуманитарных наук"][i % 5] } }),
    ),
  );

  const courseCache = new Map<string, string>();
  async function courseId(def: CourseDef) {
    const key = `${def.name}|${def.assessment}`;
    if (!courseCache.has(key)) {
      const c = await prisma.course.create({ data: { name: def.name, assessment: def.assessment, department: "—" } });
      courseCache.set(key, c.id);
    }
    return courseCache.get(key)!;
  }

  const groups: Record<string, { id: string; facultyId: string; programId: string; course: number; current: readonly CourseDef[]; past: readonly (readonly CourseDef[])[] }> = {};
  const faculties: Record<string, string> = {};

  for (const f of structure) {
    const fac = await prisma.faculty.create({ data: { name: f.name, shortName: f.short } });
    faculties[f.short] = fac.id;
    for (const p of f.programs) {
      const prog = await prisma.program.create({ data: { name: p.name, code: p.code, facultyId: fac.id } });
      for (const g of p.groups) {
        const grp = await prisma.group.create({ data: { name: g.name, course: g.course, programId: prog.id } });
        groups[g.name] = { id: grp.id, facultyId: fac.id, programId: prog.id, course: g.course, current: p.current, past: p.past };
      }
    }
  }

  /* ---------- расписание: недели -2..+6 ---------- */
  const lessonRows: Prisma.LessonCreateManyInput[] = [];
  const groupTeacher = new Map<string, string>();
  // Демо-преподаватель с кабинетом: ведёт алгоритмы в двух группах и базы данных у Анны
  const demoTeacher = teachers[11];
  for (const k of ["ИВТ-24-1Алгоритмы и структуры данных", "ИВТ-24-2Алгоритмы и структуры данных", "ИВТ-24-1Базы данных"]) groupTeacher.set(k, demoTeacher.id);
  const teacherFor = (group: string, course: string) => {
    const k = group + course;
    if (!groupTeacher.has(k)) groupTeacher.set(k, pick(teachers).id);
    return groupTeacher.get(k)!;
  };

  for (const [gName, g] of Object.entries(groups)) {
    // недельный шаблон: для каждого дня (0=Пн..5=Сб) набор пар
    const template: { day: number; pair: number; course: CourseDef; kind: LessonKind; sub: number | null; room: string; building: string }[] = [];
    const days = gName === "ИВТ-24-1" || gName === "ЭК-23-2" ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5].filter(() => rng() > 0.15);
    for (const day of days) {
      const startPair = int(0, 1);
      const count = int(2, 4);
      for (let k = 0; k < count; k++) {
        const course = g.current[(day * 3 + k) % g.current.length];
        const kind: LessonKind = k === 0 ? "LECTURE" : rng() > 0.5 ? "PRACTICE" : "LAB";
        const sub = kind === "LAB" ? (rng() > 0.5 ? 1 : 2) : null;
        template.push({ day, pair: startPair + k, course, kind, sub, room: kind === "LECTURE" ? pick(["Ауд. А-1", "101", "301"]) : pick(rooms), building: pick(buildings) });
      }
    }
    for (let w = -2; w <= 6; w++) {
      for (const t of template) {
        const date = addDays(monday, w * 7 + t.day);
        const cid = await courseId(t.course);
        lessonRows.push({
          groupId: g.id, subgroup: t.sub, courseId: cid, teacherId: teacherFor(gName, t.course.name),
          date, startTime: BELLS[t.pair][0], endTime: BELLS[t.pair][1], room: t.room, building: t.building, kind: t.kind,
        });
      }
    }
  }
  await prisma.lesson.createMany({ data: lessonRows });

  /* Изменения в расписании: в каждой неделе 0..+2 у демонстрационных групп — перенос и отмена */
  for (const gName of ["ИВТ-24-1", "ЭК-23-2"]) {
    const g = groups[gName];
    for (let w = 0; w <= 2; w++) {
      const weekLessons = await prisma.lesson.findMany({
        where: { groupId: g.id, date: { gte: addDays(monday, w * 7), lt: addDays(monday, w * 7 + 6) }, subgroup: null },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });
      const future = weekLessons.filter((l) => l.date >= todayUTC);
      const pool = future.length >= 2 ? future : weekLessons;
      if (pool.length < 2) continue;
      const moved = pool[Math.min(1, pool.length - 1)];
      const newDate = addDays(moved.date, 1);
      await prisma.lesson.update({
        where: { id: moved.id },
        data: {
          status: "MOVED", movedFromDate: moved.date, movedFromTime: moved.startTime,
          date: newDate, startTime: "15:40", endTime: "17:10", room: "418",
          changeNote: "Преподаватель на конференции — занятие перенесено", changedAt: addDays(todayUTC, -1),
        },
      });
      const cancelled = pool[pool.length - 1];
      await prisma.lesson.update({
        where: { id: cancelled.id },
        data: { status: "CANCELLED", changeNote: "Занятие отменено: аудитория занята под олимпиаду", changedAt: addDays(todayUTC, -1) },
      });
      // смена аудитории без переноса
      const roomChange = pool.find((l) => l.id !== moved.id && l.id !== cancelled.id);
      if (roomChange) {
        await prisma.lesson.update({
          where: { id: roomChange.id },
          data: { status: "MOVED", movedFromDate: roomChange.date, movedFromTime: roomChange.startTime, room: "Лаб. 3", changeNote: "Смена аудитории", changedAt: addDays(todayUTC, -2) },
        });
      }
    }
  }

  /* ---------- сессия: экзамены и зачёты ---------- */
  const sessionStart = new Date(Date.UTC(now.getFullYear(), 11, 22));
  for (const [, g] of Object.entries(groups)) {
    let i = 0;
    for (const def of g.current) {
      if (def.assessment === "COURSEWORK") continue;
      const isExam = def.assessment === "EXAM";
      const date = isExam ? addDays(sessionStart, 7 + i * 3) : addDays(sessionStart, i);
      await prisma.exam.create({
        data: { courseId: await courseId(def), groupId: g.id, date: at(date, isExam ? "09:00" : "12:00"), room: pick(rooms), kind: isExam ? "EXAM" : "CREDIT", teacher: pick(teacherNames) },
      });
      i++;
    }
  }

  /* ---------- пользователи ---------- */
  const mkStudent = async (login: string, password: string, group: string, data: { lastName: string; firstName: string; middleName?: string; subgroup: number; recordBookNo: string; email?: string; scholarship?: boolean }) => {
    const g = groups[group];
    const user = await prisma.user.create({ data: { login, passwordHash: await hash(password, ARGON), role: "STUDENT" } });
    return prisma.student.create({
      data: { userId: user.id, facultyId: g.facultyId, programId: g.programId, course: g.course, groupId: g.id, ...data },
      include: { user: true },
    });
  };

  const anna = await mkStudent("anna.lesnova", "Anna-Univer-2026", "ИВТ-24-1", {
    lastName: "Леснова", firstName: "Анна", middleName: "Викторовна", subgroup: 1, recordBookNo: "24-ИВТ-0137", email: "anna.lesnova@stud.univer.example", scholarship: true,
  });
  const petr = await mkStudent("petr.ozerov", "Petr-Univer-2026", "ЭК-23-2", {
    lastName: "Озёров", firstName: "Пётр", middleName: "Алексеевич", subgroup: 2, recordBookNo: "23-ЭК-0412", email: "petr.ozerov@stud.univer.example",
  });

  const fillers = [];
  const fillerGroups = ["ИВТ-24-1", "ИВТ-24-2", "ИВТ-23-1", "ЭК-23-1", "ЭК-23-2", "МН-24-1", "ЖР-24-1", "ПИ-25-1", "ЛН-25-1", "ИВТ-24-1"];
  for (let i = 0; i < fillerGroups.length; i++) {
    const female = rng() > 0.5;
    const p = person(female);
    fillers.push(
      await mkStudent(`student${i + 1}`, `Filler-${verifyCode()}`, fillerGroups[i], {
        ...p, subgroup: int(1, 2), recordBookNo: `${groups[fillerGroups[i]].course === 1 ? 25 : 24}-${1000 + i}`,
      }),
    );
  }

  const teacherUser = await prisma.user.create({ data: { login: "teacher", passwordHash: await hash("Teacher-Univer-2026", ARGON), role: "TEACHER" } });
  await prisma.teacher.update({ where: { id: demoTeacher.id }, data: { userId: teacherUser.id } });

  const staffUser = await prisma.user.create({ data: { login: "dekanat", passwordHash: await hash("Dekanat-Univer-2026", ARGON), role: "STAFF" } });
  const staff = await prisma.staff.create({ data: { userId: staffUser.id, fullName: "Светлова Марина Игоревна", position: "Специалист по учебной работе", facultyId: null } });

  /* ---------- оценки ---------- */
  const examValue = () => pick(["5", "5", "4", "4", "4", "3"]);
  async function gradesFor(studentId: string, groupName: string, opts: { debtCourse?: string; strong?: boolean }) {
    const g = groups[groupName];
    const curSem = g.course * 2 - 1; // осенний семестр
    // прошлые семестры
    for (let s = 0; s < g.past.length; s++) {
      const sem = s + 1;
      for (const def of g.past[s]) {
        const e = await prisma.enrollment.create({ data: { studentId, courseId: await courseId(def), semester: sem } });
        const isCredit = def.assessment === "CREDIT";
        let value = isCredit ? "PASS" : opts.strong ? pick(["5", "5", "5", "4"]) : examValue();
        if (opts.debtCourse === def.name) value = "2";
        const month = sem % 2 === 1 ? 0 : 5; // январь / июнь
        const year = now.getFullYear() - Math.ceil((curSem - sem) / 2);
        await prisma.grade.create({ data: { enrollmentId: e.id, kind: "FINAL", value, date: new Date(Date.UTC(year, month, 15 + (sem % 5))) } });
      }
    }
    // текущий семестр: текущие баллы (до сессии)
    for (const def of g.current) {
      const e = await prisma.enrollment.create({ data: { studentId, courseId: await courseId(def), semester: curSem } });
      const n = int(2, 4);
      for (let k = 0; k < n; k++) {
        const pts = opts.strong ? int(14, 20) : int(8, 19);
        await prisma.grade.create({
          data: { enrollmentId: e.id, kind: k === n - 1 ? "MIDTERM" : "CURRENT", value: String(pts), points: pts, date: addDays(todayUTC, -7 * (n - k) - int(0, 3)), note: k === n - 1 ? "Контрольная точка" : pick(["Лабораторная работа", "Практическое задание", "Тест", "Доклад"]) },
        });
      }
    }
  }
  await gradesFor(anna.id, "ИВТ-24-1", { strong: true });
  await gradesFor(petr.id, "ЭК-23-2", { debtCourse: "Методы оптимальных решений" });
  for (const f of fillers) await gradesFor(f.id, Object.keys(groups).find((k) => groups[k].id === f.groupId)!, {});

  // пересдача для Петра
  await prisma.exam.create({
    data: { courseId: await courseId(C("Методы оптимальных решений")), groupId: groups["ЭК-23-2"].id, date: at(addDays(todayUTC, 5), "15:40"), room: "306", kind: "RETAKE", teacher: "Зимин Р. Н." },
  });

  /* ---------- типы заявок ---------- */
  const types = [
    { code: "CERT_STUDY", category: "Справки", title: "Справка об обучении", description: "Подтверждает, что вы учитесь в «Универе». Подходит для работы, банка, соцзащиты.", isCertificate: true, slaDays: 1, needsPaper: false,
      fields: [{ name: "place", label: "Куда предоставляется", type: "text", required: true, placeholder: "Например: по месту работы" }, { name: "copies", label: "Количество экземпляров", type: "select", options: ["1", "2", "3"], required: true }] },
    { code: "CERT_MILITARY", category: "Справки", title: "Справка для военкомата", description: "Для отсрочки. Военкомат обычно принимает только бумажный оригинал с печатью.", isCertificate: true, slaDays: 3, needsPaper: true,
      fields: [{ name: "commissariat", label: "Военный комиссариат", type: "text", required: true, placeholder: "Например: Центральный район" }] },
    { code: "CERT_SCHOLARSHIP", category: "Справки", title: "Справка о стипендии", description: "Размер стипендии за выбранный период — для соцзащиты или субсидий.", isCertificate: true, slaDays: 2, needsPaper: false,
      fields: [{ name: "period", label: "Период", type: "select", options: ["3 месяца", "6 месяцев", "12 месяцев"], required: true }] },
    { code: "APP_RETAKE", category: "Заявления", title: "Заявление на пересдачу", description: "Назначение пересдачи по дисциплине с академической задолженностью.", isCertificate: false, slaDays: 3, needsPaper: false,
      fields: [{ name: "course", label: "Дисциплина", type: "text", required: true }, { name: "reason", label: "Комментарий", type: "textarea", required: false }] },
    { code: "APP_ABSENCE", category: "Заявления", title: "Уважительная причина пропуска", description: "Болезнь, соревнования, семейные обстоятельства. Приложите подтверждение в деканате.", isCertificate: false, slaDays: 3, needsPaper: false,
      fields: [{ name: "dateFrom", label: "С", type: "date", required: true }, { name: "dateTo", label: "По", type: "date", required: true }, { name: "reason", label: "Причина", type: "textarea", required: true }] },
    { code: "APP_ACADEMIC_LEAVE", category: "Заявления", title: "Академический отпуск", description: "Перерыв в учёбе по медицинским, семейным или иным основаниям.", isCertificate: false, slaDays: 10, needsPaper: false,
      fields: [{ name: "basis", label: "Основание", type: "select", options: ["Медицинские показания", "Семейные обстоятельства", "Служба в армии", "Другое"], required: true }, { name: "dateFrom", label: "С какой даты", type: "date", required: true }] },
    { code: "APP_OTHER", category: "Обращения", title: "Обращение в деканат", description: "Любой вопрос, который не подходит под другие заявки.", isCertificate: false, slaDays: 5, needsPaper: false,
      fields: [{ name: "subject", label: "Тема", type: "text", required: true }, { name: "text", label: "Текст обращения", type: "textarea", required: true }] },
  ];
  const typeIds: Record<string, string> = {};
  for (const t of types) typeIds[t.code] = (await prisma.requestType.create({ data: t })).id;

  /* ---------- заявки ---------- */
  async function mkRequest(student: { id: string; userId: string }, code: string, payload: Record<string, string>, history: { to: "NEW" | "IN_REVIEW" | "NEED_INFO" | "READY" | "DONE" | "REJECTED"; daysAgo: number; staff?: boolean; message?: string }[], wantsPaper = false) {
    const last = history[history.length - 1];
    const r = await prisma.request.create({
      data: { studentId: student.id, typeId: typeIds[code], status: last.to, payload, wantsPaper, createdAt: addDays(now, -history[0].daysAgo), assigneeId: history.some((h) => h.staff) ? staff.id : null },
    });
    let prev: typeof last.to | null = null;
    for (const h of history) {
      await prisma.requestEvent.create({
        data: { requestId: r.id, fromStatus: prev, toStatus: h.to, authorUserId: h.staff ? staffUser.id : student.userId, message: h.message, createdAt: addDays(now, -h.daysAgo) },
      });
      prev = h.to;
    }
    if (types.find((t) => t.code === code)?.isCertificate && (last.to === "READY" || last.to === "DONE")) {
      await prisma.certificate.create({ data: { requestId: r.id, verifyCode: verifyCode(), issuedAt: addDays(now, -last.daysAgo), validUntil: addDays(now, 180 - last.daysAgo) } });
    }
    return r;
  }

  await mkRequest(anna, "CERT_STUDY", { place: "По месту работы", copies: "1" }, [
    { to: "NEW", daysAgo: 12 }, { to: "IN_REVIEW", daysAgo: 12, staff: true }, { to: "READY", daysAgo: 11, staff: true, message: "Справка готова, можно скачать PDF." }, { to: "DONE", daysAgo: 10, staff: true },
  ]);
  const annaAbsence = await mkRequest(anna, "APP_ABSENCE", { dateFrom: addDays(todayUTC, -9).toISOString().slice(0, 10), dateTo: addDays(todayUTC, -7).toISOString().slice(0, 10), reason: "Участие в студенческой олимпиаде по программированию" }, [
    { to: "NEW", daysAgo: 3 }, { to: "IN_REVIEW", daysAgo: 2, staff: true, message: "Взяли в работу, проверяем приказ об олимпиаде." },
  ]);
  const petrRetake = await mkRequest(petr, "APP_RETAKE", { course: "Методы оптимальных решений", reason: "" }, [
    { to: "NEW", daysAgo: 6 }, { to: "IN_REVIEW", daysAgo: 5, staff: true }, { to: "NEED_INFO", daysAgo: 4, staff: true, message: "Уточните, пожалуйста: вы хотите сдавать комиссии или преподавателю? Ответьте в заявке." },
  ]);
  await mkRequest(petr, "CERT_MILITARY", { commissariat: "Центральный район" }, [{ to: "NEW", daysAgo: 1 }], true);
  for (let i = 0; i < fillers.length; i++) {
    const f = fillers[i];
    const code = pick(["CERT_STUDY", "CERT_SCHOLARSHIP", "APP_ABSENCE", "APP_OTHER", "CERT_MILITARY"]);
    const payload: Record<string, string> =
      code === "CERT_STUDY" ? { place: pick(["В банк", "В соцзащиту", "По месту работы родителей"]), copies: "1" }
      : code === "CERT_SCHOLARSHIP" ? { period: "6 месяцев" }
      : code === "APP_ABSENCE" ? { dateFrom: addDays(todayUTC, -5).toISOString().slice(0, 10), dateTo: addDays(todayUTC, -4).toISOString().slice(0, 10), reason: "Болезнь, справка из поликлиники" }
      : code === "CERT_MILITARY" ? { commissariat: "Северный район" }
      : { subject: "Перевод на другую форму обучения", text: "Подскажите, какие документы нужны для перевода на заочную форму." };
    const hist: Parameters<typeof mkRequest>[3] = i % 3 === 0 ? [{ to: "NEW", daysAgo: i === 0 ? 3 : 0 }] : [{ to: "NEW", daysAgo: 1 }, { to: "IN_REVIEW", daysAgo: 0.5, staff: true }];
    await mkRequest(f, code, payload, hist, code === "CERT_MILITARY");
  }

  /* ---------- объявления и дедлайны ---------- */
  const ann = [
    { title: "Расписание зимней сессии опубликовано", body: "Экзамены начинаются после Нового года. Проверьте даты в разделе «Учёба» → «Сессия». Если экзамены стоят в один день — напишите в деканат.", audience: "ALL" as const, pinned: true, daysAgo: 2 },
    { title: "Продление студенческих билетов", body: "До конца месяца продлите студенческий в каб. 204. Электронная справка об обучении уже доступна онлайн — в очереди стоять не нужно.", audience: "ALL" as const, pinned: false, daysAgo: 4 },
    { title: "Хакатон ФИТ: регистрация открыта", body: "Командный хакатон для студентов ФИТ. Участие засчитывается как проектная активность. Регистрация — до пятницы.", audience: "FACULTY" as const, facultyId: faculties["ФИТ"], pinned: false, daysAgo: 1 },
    { title: "Консультации по курсовым работам", body: "Консультации по курсовой работе по финансам — по средам в ауд. 306 с 15:40. Черновик нужно сдать за две недели до защиты.", audience: "GROUP" as const, groupId: groups["ЭК-23-2"].id, pinned: false, daysAgo: 3 },
    { title: "Неделя психологической поддержки", body: "Бесплатные консультации психолога в студенческом центре. Запись анонимная, через кабинет — раздел «Ещё».", audience: "ALL" as const, pinned: false, daysAgo: 6 },
    { title: "Изменение режима работы библиотеки", body: "В период сессии читальный зал работает до 22:00, включая субботу.", audience: "ALL" as const, pinned: false, daysAgo: 8 },
  ];
  for (const a of ann) {
    await prisma.announcement.create({
      data: { title: a.title, body: a.body, audience: a.audience, facultyId: "facultyId" in a ? a.facultyId : null, groupId: "groupId" in a ? a.groupId : null, pinned: a.pinned, authorStaffId: staff.id, publishedAt: addDays(now, -a.daysAgo) },
    });
  }
  const dl = [
    { title: "Сдать лабораторную №4 по базам данных", days: 2, audience: "GROUP" as const, groupId: groups["ИВТ-24-1"].id },
    { title: "Выбор темы курсовой работы", days: 6, audience: "FACULTY" as const, facultyId: faculties["ФИТ"] },
    { title: "Черновик курсовой по финансам", days: 4, audience: "GROUP" as const, groupId: groups["ЭК-23-2"].id },
    { title: "Анкета качества преподавания", days: 9, audience: "ALL" as const },
    { title: "Оплата общежития за декабрь", days: 12, audience: "ALL" as const },
  ];
  for (const d of dl) {
    await prisma.deadline.create({
      data: { title: d.title, dueAt: at(addDays(todayUTC, d.days), "23:59"), audience: d.audience, facultyId: "facultyId" in d ? d.facultyId : null, groupId: "groupId" in d ? d.groupId : null },
    });
  }

  /* ---------- уведомления ---------- */
  const notes = (userId: string, items: { kind: Prisma.NotificationCreateManyInput["kind"]; title: string; body: string; link?: string; hoursAgo: number; read?: boolean }[]) =>
    prisma.notification.createMany({
      data: items.map((n) => ({ userId, kind: n.kind, title: n.title, body: n.body, link: n.link, createdAt: new Date(now.getTime() - n.hoursAgo * 3600000), readAt: n.read ? now : null })),
    });
  await notes(anna.userId, [
    { kind: "SCHEDULE_CHANGE", title: "Перенос занятия", body: "Одно из занятий этой недели перенесено. Проверьте расписание.", link: "/schedule", hoursAgo: 20 },
    { kind: "REQUEST_STATUS", title: "Заявка взята в работу", body: "«Уважительная причина пропуска» — деканат проверяет документы.", link: `/requests/${annaAbsence.id}`, hoursAgo: 46 },
    { kind: "ANNOUNCEMENT", title: "Хакатон ФИТ: регистрация открыта", body: "Регистрация — до пятницы.", link: "/notifications?tab=news", hoursAgo: 24, read: true },
    { kind: "REQUEST_STATUS", title: "Справка готова", body: "«Справка об обучении» готова — скачайте PDF.", link: "/requests", hoursAgo: 260, read: true },
  ]);
  await notes(petr.userId, [
    { kind: "REQUEST_STATUS", title: "Нужно уточнение по заявке", body: "Деканат задал вопрос по заявлению на пересдачу.", link: `/requests/${petrRetake.id}`, hoursAgo: 90 },
    { kind: "GRADE", title: "Назначена пересдача", body: "«Методы оптимальных решений» — через 5 дней, ауд. 306.", link: "/grades", hoursAgo: 30 },
    { kind: "SCHEDULE_CHANGE", title: "Занятие отменено", body: "Одно из занятий на этой неделе отменено.", link: "/schedule", hoursAgo: 18 },  ]);

  console.log("Seed OK:", { lessons: lessonRows.length, students: 2 + fillers.length, staff: 1 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
