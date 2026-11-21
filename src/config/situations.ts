/**
 * Жизненные ситуации единого окна: студент выбирает, что с ним случилось, и получает план из шагов
 * в деканате и у преподавателей. Состояние шагов вычисляется по данным (заявка подана, документ загружен, записан на приём);
 * шаги «прочитать / сообщить» отмечаются вручную. Тексты и правила вымышленные.
 */
import type { DocKind } from "@prisma/client";

export type SituationStep =
  | { key: string; kind: "request"; typeCode: string; title: string; hint: string; prefill?: Record<string, string>; optional?: boolean }
  | { key: string; kind: "doc"; docKind: DocKind; title: string; hint: string; optional?: boolean }
  | { key: string; kind: "appointment"; purpose: string; title: string; hint: string; optional?: boolean }
  | { key: string; kind: "notifyTeachers"; title: string; hint: string; optional?: boolean }
  | { key: string; kind: "read"; libraryTitle: string; title: string; hint: string; optional?: boolean }
  | { key: string; kind: "check"; check: "photo" | "push"; href: string; title: string; hint: string; optional?: boolean };

export type Situation = { code: string; title: string; short: string; emoji: string; tone: string; intro: string; keywords: string[]; steps: SituationStep[] };

export const situations: Situation[] = [
  {
    code: "sick",
    title: "Я заболел",
    short: "Пропуски, справка, перенос контрольных",
    emoji: "🤒",
    tone: "bg-p-peach",
    intro: "Выздоравливайте! Чтобы пропуски засчитали как уважительные и не пришлось потом разбираться — четыре шага.",
    keywords: ["заболел", "заболела", "болею", "больнич", "простыл", "температур", "в больнице", "сломал"],
    steps: [
      { key: "teachers", kind: "notifyTeachers", title: "Предупредить преподавателей", hint: "Одно сообщение всем преподавателям группы: даты, когда вас не будет. Они увидят его у себя." },
      { key: "absence", kind: "request", typeCode: "APP_ABSENCE", title: "Заявление об уважительной причине", hint: "Подать в течение 10 дней после выхода на учёбу.", prefill: { reason: "Болезнь" } },
      { key: "medical", kind: "doc", docKind: "MEDICAL", title: "Справка из поликлиники", hint: "Сфотографируйте и загрузите — приложится к заявлению." },
      { key: "original", kind: "appointment", purpose: "Принести оригинал справки о болезни", title: "Отдать оригинал справки", hint: "Запишитесь на удобное время — без очереди.", optional: true },
    ],
  },
  {
    code: "army",
    title: "Ухожу в армию",
    short: "Справка для военкомата, академический отпуск",
    emoji: "🎖️",
    tone: "bg-p-sky",
    intro: "Место в вузе за вами сохранится: оформим справку для военкомата и академический отпуск.",
    keywords: ["армия", "армию", "призыв", "повестк", "военкомат", "служить"],
    steps: [
      { key: "military-doc", kind: "doc", docKind: "MILITARY", title: "Повестка или приписное", hint: "Нужны для академического отпуска по призыву." },
      { key: "cert", kind: "request", typeCode: "CERT_MILITARY", title: "Справка для военкомата", hint: "Бумажный оригинал с печатью — заберёте в деканате." },
      { key: "leave", kind: "request", typeCode: "APP_ACADEMIC_LEAVE", title: "Академический отпуск по призыву", hint: "До 2 лет, место сохраняется.", prefill: { basis: "Служба в армии" } },
      { key: "rules", kind: "read", libraryTitle: "Академический отпуск", title: "Что будет со стипендией и как вернуться", hint: "Коротко — в библиотеке." },
      { key: "visit", kind: "appointment", purpose: "Забрать справку для военкомата", title: "Забрать справку", hint: "Когда справка будет готова.", optional: true },
    ],
  },
  {
    code: "dorm",
    title: "Заселяюсь в общежитие",
    short: "Документы, заявка, время заселения",
    emoji: "🏠",
    tone: "bg-p-mint",
    intro: "Направление на заселение выдаёт деканат. Подготовьте документы заранее — студгородок заселит по направлению за 15 минут.",
    keywords: ["общежит", "общаг", "заселен", "заселиться", "засел", "комнат"],
    steps: [
      { key: "passport", kind: "doc", docKind: "PASSPORT", title: "Паспорт", hint: "Разворот с фото и прописка." },
      { key: "fluoro", kind: "doc", docKind: "FLUORO", title: "Флюорография", hint: "Не старше года — без неё не заселяют." },
      { key: "checkin", kind: "request", typeCode: "DORM_CHECKIN", title: "Направление на заселение", hint: "Деканат проверит документы и выдаст направление." },
      { key: "visit", kind: "appointment", purpose: "Получить направление на заселение", title: "Забрать направление", hint: "Когда направление будет готово — придёте без очереди.", optional: true },
    ],
  },
  {
    code: "money",
    title: "Нужны деньги на учёбу",
    short: "Материальная помощь, стипендия",
    emoji: "💳",
    tone: "bg-p-yellow",
    intro: "Заявление на материальную помощь принимает деканат — подайте один раз с реквизитами карты, дальше мы проведём сами.",
    keywords: ["материальн", "матпомощ", "деньги", "денег", "трудная ситуац", "не хватает"],
    steps: [
      { key: "bank", kind: "doc", docKind: "BANK", title: "Реквизиты карты", hint: "На эту карту придёт выплата." },
      { key: "help", kind: "request", typeCode: "APP_MATHELP", title: "Заявление на материальную помощь", hint: "Деканат рассмотрит и передаст решение на выплату." },
      { key: "rules", kind: "read", libraryTitle: "Стипендия: виды и условия", title: "Какие ещё выплаты положены", hint: "Социальная и повышенная стипендия." },
    ],
  },
  {
    code: "transfer",
    title: "Хочу перевестись",
    short: "Перевод на другую программу, перезачёт",
    emoji: "🔁",
    tone: "bg-p-lilac",
    intro: "Перевод решает деканат, а сданные дисциплины можно перезачесть — их согласует преподаватель.",
    keywords: ["перевест", "перевод", "другую программ", "другой факультет", "смени", "перезач"],
    steps: [
      { key: "transfer", kind: "request", typeCode: "APP_TRANSFER", title: "Заявление о переводе", hint: "Укажите, куда и почему." },
      { key: "recredit", kind: "request", typeCode: "APP_RECREDIT", title: "Перезачёт дисциплины", hint: "Если уже сдавали похожий курс — его согласует преподаватель.", optional: true },
      { key: "visit", kind: "appointment", purpose: "Консультация по переводу", title: "Консультация в деканате", hint: "Обсудить разницу в учебных планах.", optional: true },
    ],
  },
  {
    code: "freshman",
    title: "Я первокурсник",
    short: "Всё, что нужно в первый месяц",
    emoji: "🎓",
    tone: "bg-p-sky",
    intro: "Добро пожаловать в «Универ»! Пройдите этот список — и в первый месяц не придётся никуда бегать.",
    keywords: ["первокурсн", "первый курс", "поступил", "новенький", "с чего начать учеб"],
    steps: [
      { key: "photo", kind: "check", check: "photo", href: "/profile", title: "Фото для студенческого", hint: "Загрузите в профиле — деканат проверит." },
      { key: "push", kind: "check", check: "push", href: "/profile", title: "Включить уведомления", hint: "Чтобы не пропустить перенос пары.", optional: true },
      { key: "passport", kind: "doc", docKind: "PASSPORT", title: "Паспорт", hint: "Один раз — дальше подставляется в заявки." },
      { key: "snils", kind: "doc", docKind: "SNILS", title: "СНИЛС", hint: "Нужен для стипендии." },
      { key: "bank", kind: "doc", docKind: "BANK", title: "Реквизиты карты для стипендии", hint: "Без них стипендию не перечислят." },
      { key: "where", kind: "read", libraryTitle: "Деканат и службы: где и когда", title: "Где деканат и службы", hint: "Кабинеты и часы работы." },
    ],
  },
];

export const situationByCode = (code: string) => situations.find((s) => s.code === code);

/** Ситуация по фразе («я заболел», «ухожу в армию») — для помощника. */
export function situationFromText(text: string) {
  const t = text.toLowerCase().replace(/ё/g, "е");
  return situations.find((s) => s.keywords.some((k) => t.includes(k)));
}
