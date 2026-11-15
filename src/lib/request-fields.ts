import { z } from "zod";

export type FieldDef = { name: string; label: string; type: "text" | "textarea" | "select" | "date"; required?: boolean; options?: string[]; placeholder?: string };

export function parseFields(json: unknown): FieldDef[] {
  return Array.isArray(json) ? (json as FieldDef[]) : [];
}

/** Строит zod-схему по описанию полей типа заявки. Неизвестные поля отбрасываются. */
export function payloadSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const f of fields) {
    let s = z.string().trim().max(f.type === "textarea" ? 2000 : 200);
    if (f.type === "date") s = s.regex(/^(\d{4}-\d{2}-\d{2})?$/, `${f.label}: неверная дата`);
    if (f.type === "select" && f.options?.length) s = s.refine((v) => v === "" || f.options!.includes(v), `${f.label}: выберите вариант`) as unknown as z.ZodString;
    shape[f.name] = f.required ? s.min(1, `Заполните поле «${f.label}»`) : s.default("") as unknown as z.ZodType<string>;
  }
  return z.object(shape);
}
