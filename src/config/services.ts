/**
 * Единое окно ведёт деканат: все услуги (справки, заявления, выплаты, направление в общежитие) подаются и решаются
 * в деканате; профильные службы (бухгалтерия, хозчасть, ИТ) получают уже оформленное решение вне системы.
 * Всё вымышленное: кабинет, часы. Приём — слотами по slotMinutes в рабочие дни.
 */
import type { DocKind } from "@prisma/client";

export const deanery = {
  name: "Деканат",
  room: "каб. 204, главный корпус",
  hours: "Пн–Пт 10:00–17:00, обед 13:00–14:00",
  open: "10:00",
  close: "17:00",
  lunch: ["13:00", "14:00"] as [string, string] | null,
  slotMinutes: 15,
  /** дни приёма (0 — воскресенье) */
  days: [1, 2, 3, 4, 5],
};

/** Документы в «Моих документах»: подпись, есть ли срок действия, подсказка. */
export const docKinds: Record<DocKind, { title: string; expires: boolean; hint: string }> = {
  PASSPORT: { title: "Паспорт", expires: false, hint: "Разворот с фото и страница с пропиской" },
  SNILS: { title: "СНИЛС", expires: false, hint: "Лицевая сторона или выписка" },
  INN: { title: "ИНН", expires: false, hint: "Свидетельство или выписка с Госуслуг" },
  MED_086: { title: "Медсправка 086/у", expires: true, hint: "Действует 1 год" },
  FLUORO: { title: "Флюорография", expires: true, hint: "Действует 1 год — нужна для общежития" },
  MEDICAL: { title: "Справка о болезни", expires: false, hint: "Из поликлиники — для уважительного пропуска" },
  BANK: { title: "Реквизиты карты", expires: false, hint: "Для стипендии и материальной помощи — выписка из банка" },
  MILITARY: { title: "Военный документ", expires: false, hint: "Приписное свидетельство или повестка" },
  OTHER: { title: "Другой документ", expires: false, hint: "Всё, что попросил деканат" },
};

export const DOC_ORDER: DocKind[] = ["PASSPORT", "SNILS", "INN", "BANK", "FLUORO", "MED_086", "MEDICAL", "MILITARY", "OTHER"];
