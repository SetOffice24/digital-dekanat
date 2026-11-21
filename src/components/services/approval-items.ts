import "server-only";
/** Строки согласований → данные для карточек (подписи полей, документы, путь). */
import type { ApprovalRow } from "@/server/services/requests";
import { stepLabel } from "@/server/services/requests";
import { parseFields } from "@/lib/request-fields";
import { docKinds } from "@/config/services";
import { fmtDate } from "@/lib/utils";
import type { ApprovalItem } from "./approval-list";

export function toApprovalItems(rows: ApprovalRow[]): ApprovalItem[] {
  return rows.map((a) => {
    const r = a.request;
    const payload = (r.payload ?? {}) as Record<string, string>;
    return {
      id: a.id,
      number: r.number,
      title: r.type.title,
      student: `${r.student.lastName} ${r.student.firstName}${r.student.middleName ? ` ${r.student.middleName}` : ""}`,
      group: `${r.student.group.name}, ${r.student.faculty.shortName}`,
      created: fmtDate(r.createdAt),
      due: r.dueAt ? fmtDate(r.dueAt) : null,
      fields: parseFields(r.type.fields).map((f) => ({ label: f.label, value: payload[f.name] ?? "" })),
      comment: r.comment,
      docs: r.documents.map(({ document: d }) => ({ id: d.id, title: docKinds[d.kind].title, status: d.status })),
      route: r.approvals.map((x) => ({ label: stepLabel(x), status: x.status, comment: x.comment })),
      owner: "Деканат",
    };
  });
}
