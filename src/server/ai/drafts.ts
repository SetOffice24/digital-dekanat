import "server-only";
import { prisma } from "../db";
import { parseFields, type FieldDef } from "@/lib/request-fields";

/**
 * Карточка действия в чате помощника: ИИ распознал, что нужна справка, и заполнил что понял.
 * Клиент показывает поля (недостающие — заполнить на месте) и кнопку «Заказать».
 * Сама заявка создаётся только по нажатию — той же функцией, что и обычная форма.
 */
export type DraftCard = {
  typeCode: string;
  title: string;
  /** справки заказываются в один клик; заявления — через полную форму */
  oneClick: boolean;
  needsPaper: boolean;
  slaDays: number;
  fields: FieldDef[];
  values: Record<string, string>;
  requestId?: string;
  requestNumber?: number;
};

type StoredDraft = { typeCode?: string; payload?: Record<string, string>; requestId?: string };

export async function describeDraft(raw: unknown): Promise<DraftCard | null> {
  const d = raw as StoredDraft | null;
  if (!d?.typeCode) return null;
  const type = await prisma.requestType.findUnique({ where: { code: d.typeCode } });
  if (!type) return null;
  const fields = parseFields(type.fields);
  const req = d.requestId ? await prisma.request.findUnique({ where: { id: d.requestId }, select: { id: true, number: true } }) : null;
  return {
    typeCode: type.code,
    title: type.title,
    oneClick: type.isCertificate,
    needsPaper: type.needsPaper,
    slaDays: type.slaDays,
    fields,
    values: Object.fromEntries(fields.map((f) => [f.name, String(d.payload?.[f.name] ?? "")])),
    requestId: req?.id,
    requestNumber: req?.number,
  };
}
