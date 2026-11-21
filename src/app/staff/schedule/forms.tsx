"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { cn, fmtShort, parseIsoDate, roomLabel } from "@/lib/utils";
import { Input, Label, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { bells } from "@/config/university";
import { cancelLessonAction, moveLessonAction, type SchedState } from "./actions";

type LessonNow = { id: string; date: string; room: string; start: string; end: string };

export function MoveForm({ id, date, room, start, end }: LessonNow) {
  const [state, action] = useActionState(moveLessonAction, {} as SchedState);
  // по умолчанию — текущее время пары; нестандартное время — отдельным вариантом, а не молчаливая «1 пара»
  const current = `${start}|${end}`;
  const standard = bells.some((b) => `${b.start}|${b.end}` === current);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted">
        Сейчас: {fmtShort(parseIsoDate(date)!)}, {start}–{end}, {roomLabel(room)}. Меняйте только то, что переносится, — остальное останется как есть.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`d-${id}`}>Новая дата</Label>
          <Input id={`d-${id}`} type="date" name="date" defaultValue={date} required />
        </div>
        <div>
          <Label htmlFor={`r-${id}`}>Аудитория</Label>
          <Input id={`r-${id}`} name="room" defaultValue={room} required maxLength={20} />
        </div>
      </div>
      <div>
        <Label htmlFor={`b-${id}`}>Пара</Label>
        <Select id={`b-${id}`} name="bell" required defaultValue={standard ? current : "keep"}>
          {!standard && <option value="keep">Как сейчас · {start}–{end}</option>}
          {bells.map((b) => (
            <option key={b.n} value={`${b.start}|${b.end}`}>
              {b.n} пара · {b.start}–{b.end}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`m-${id}`}>Причина</Label>
        <Input id={`m-${id}`} name="reason" required maxLength={300} placeholder="Например: болезнь преподавателя" />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton className="w-full" pendingText="Переносим…">
        Перенести
      </SubmitButton>
    </form>
  );
}

export function CancelForm({ id }: { id: string }) {
  const [state, action] = useActionState(cancelLessonAction, {} as SchedState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Label htmlFor={`c-${id}`}>Причина отмены</Label>
        <Input id={`c-${id}`} name="reason" required maxLength={300} placeholder="Например: преподаватель на конференции" />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton variant="danger" className="w-full" pendingText="Отменяем…">
        Отменить занятие
      </SubmitButton>
    </form>
  );
}

/** Действия с парой: две компактные кнопки, форма раскрывается под строкой — одна за раз. */
export function LessonActions(lesson: LessonNow) {
  const { id } = lesson;
  const [open, setOpen] = useState<"move" | "cancel" | null>(null);
  const btn = "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition";
  return (
    <div className="contents">
      <div className="flex shrink-0 gap-1.5">
        <button type="button" aria-expanded={open === "move"} onClick={() => setOpen(open === "move" ? null : "move")} className={cn(btn, open === "move" ? "border-ink bg-ink text-ink-fg" : "border-border hover:border-ink")}>
          Перенести
        </button>
        <button type="button" aria-expanded={open === "cancel"} onClick={() => setOpen(open === "cancel" ? null : "cancel")} className={cn(btn, open === "cancel" ? "border-danger bg-danger text-white" : "border-transparent text-danger hover:bg-danger-soft")}>
          Отменить
        </button>
      </div>
      {open && (
        <div className="basis-full rounded-2xl bg-surface-2 p-3 sm:ml-[4.5rem]">
          {open === "move" ? <MoveForm {...lesson} /> : <CancelForm id={id} />}
        </div>
      )}
    </div>
  );
}

/** Выбор группы: сразу открывает её расписание, без кнопки «Показать». */
export function GroupPicker({ groups, value, date }: { groups: { id: string; name: string }[]; value?: string; date: string }) {
  const router = useRouter();
  return (
    <Select aria-label="Группа" value={value} onChange={(e) => router.push(`/staff/schedule?group=${e.target.value}&date=${date}`)} className="w-full sm:w-48">
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );
}
