import type { LessonKind, RequestStatus, Assessment, NotificationKind } from "@prisma/client";

export const lessonKindLabel: Record<LessonKind, string> = {
  LECTURE: "Лекция",
  PRACTICE: "Практика",
  LAB: "Лабораторная",
  EXAM: "Экзамен",
  CONSULTATION: "Консультация",
};

export const assessmentLabel: Record<Assessment, string> = {
  EXAM: "Экзамен",
  CREDIT: "Зачёт",
  GRADED_CREDIT: "Дифф. зачёт",
  COURSEWORK: "Курсовая",
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  NEW: "Новая",
  IN_REVIEW: "В работе",
  NEED_INFO: "Нужно уточнение",
  READY: "Готова",
  DONE: "Завершена",
  REJECTED: "Отклонена",
};

export const requestStatusTone: Record<RequestStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  NEW: "neutral",
  IN_REVIEW: "info",
  NEED_INFO: "warning",
  READY: "success",
  DONE: "success",
  REJECTED: "danger",
};

export const notificationKindLabel: Record<NotificationKind, string> = {
  SCHEDULE_CHANGE: "Расписание",
  REQUEST_STATUS: "Заявка",
  ANNOUNCEMENT: "Объявление",
  DEADLINE: "Дедлайн",
  GRADE: "Учёба",
  SYSTEM: "Система",
};

export const gradeText = (v: string) =>
  v === "PASS" ? "Зачтено" : v === "FAIL" ? "Не зачтено" : v === "5" ? "Отлично" : v === "4" ? "Хорошо" : v === "3" ? "Удовл." : v === "2" ? "Неудовл." : v;
