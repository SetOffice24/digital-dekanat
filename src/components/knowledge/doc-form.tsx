"use client";
import { useActionState, useState } from "react";
import { FileUp, PenLine } from "lucide-react";
import { Input, Label, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { cn } from "@/lib/utils";
import { FilePick } from "@/components/file-pick";
import { createDocAction, updateDocAction, type LibState } from "@/app/library-actions";

type Opt = { id: string; name: string };
export type CourseTarget = Opt & { groups: Opt[] };
export type DocValues = { id: string; title: string; body: string; scope: "UNIVERSITY" | "FACULTY" | "COURSE"; facultyId: string | null; courseId: string | null; groupId: string | null };

/**
 * Новый материал библиотеки или правка. Деканат выбирает «весь вуз / факультет»,
 * преподаватель — свою дисциплину и группу (или все свои группы по ней).
 * Новый материал: написать текст или загрузить PDF/Word — текст извлечётся и откроется на проверку.
 */
export function DocForm({ role, doc, faculties = [], staffFacultyId = null, targets = [] }: { role: "STAFF" | "TEACHER"; doc?: DocValues; faculties?: Opt[]; staffFacultyId?: string | null; targets?: CourseTarget[] }) {
  const [state, action] = useActionState(doc ? updateDocAction : createDocAction, {} as LibState);
  const [source, setSource] = useState<"text" | "file">("text");
  const [scope, setScope] = useState(doc?.scope ?? (role === "TEACHER" ? "COURSE" : staffFacultyId ? "FACULTY" : "UNIVERSITY"));
  const [courseId, setCourseId] = useState(doc?.courseId ?? targets[0]?.id ?? "");
  const groups = targets.find((t) => t.id === courseId)?.groups ?? [];

  return (
    <form action={action} className="space-y-4">
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div>
        <Label htmlFor="title">Название</Label>
        <Input id="title" name="title" required maxLength={160} defaultValue={doc?.title} placeholder={role === "TEACHER" ? "Требования к курсовой работе" : "Как оформить академический отпуск"} />
      </div>

      {role === "STAFF" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="scope">Для кого</Label>
            <Select id="scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value as DocValues["scope"])}>
              {!staffFacultyId && <option value="UNIVERSITY">Весь вуз</option>}
              <option value="FACULTY">{staffFacultyId ? "Свой факультет" : "Один факультет"}</option>
            </Select>
          </div>
          {scope === "FACULTY" && !staffFacultyId && (
            <div>
              <Label htmlFor="facultyId">Факультет</Label>
              <Select id="facultyId" name="facultyId" required defaultValue={doc?.facultyId ?? ""}>
                <option value="" disabled>Выберите</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="scope" value="COURSE" />
          <div>
            <Label htmlFor="courseId">Дисциплина</Label>
            <Select id="courseId" name="courseId" required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="groupId">Группы</Label>
            <Select key={courseId} id="groupId" name="groupId" defaultValue={doc?.courseId === courseId ? doc?.groupId ?? "" : ""}>
              <option value="">Все мои группы по дисциплине</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {!doc && (
        <div className="flex w-full rounded-full bg-surface-2 p-1 sm:inline-flex sm:w-auto" role="tablist" aria-label="Как добавить текст">
          {(
            [
              ["text", "Написать", PenLine],
              ["file", "PDF или Word", FileUp],
            ] as const
          ).map(([v, label, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={source === v} onClick={() => setSource(v)} className={cn("inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition sm:flex-none", source === v ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}

      {source === "file" && !doc ? (
        <div>
          <Label htmlFor="pick-file">Файл</Label>
          <FilePick accept=".pdf,.docx" required />
          <p className="mt-1.5 text-[13px] text-muted">До 10 МБ. Текст извлечётся автоматически — после загрузки вы его проверите. Сканы без текста не подойдут.</p>
        </div>
      ) : (
        <div>
          <Label htmlFor="body">Текст</Label>
          <Textarea id="body" name="body" required defaultValue={doc?.body} className="min-h-72 font-[inherit] leading-relaxed" placeholder={"Заголовок раздела\nТекст раздела: правила, сроки, куда идти.\n\nСледующий раздел\n…"} />
          <p className="mt-1.5 text-[13px] text-muted">Пишите разделами: короткий заголовок на отдельной строке, ниже — текст. Помощник цитирует студентам подходящий раздел.</p>
        </div>
      )}

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton className="w-full sm:w-auto" pendingText={source === "file" ? "Читаем файл…" : "Сохраняем…"}>
        {doc ? "Сохранить" : "Добавить в библиотеку"}
      </SubmitButton>
    </form>
  );
}
