"use client";
import { useActionState } from "react";
import { Input, Label, Select } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { bells } from "@/config/university";
import { cancelLessonAction, moveLessonAction, type SchedState } from "./actions";

export function MoveForm({ id, date, room }: { id: string; date: string; room: string }) {
  const [state, action] = useActionState(moveLessonAction, {} as SchedState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-2">
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
        <Select id={`b-${id}`} name="bell" required>
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
