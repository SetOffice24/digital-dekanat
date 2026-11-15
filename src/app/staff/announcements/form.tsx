"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Input, Label, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { createAnnouncementAction, type AnnState } from "./actions";

type Opt = { id: string; name: string };

export function AnnouncementForm({ faculties, groups, canAll }: { faculties: Opt[]; groups: Opt[]; canAll: boolean }) {
  const [state, action] = useActionState(createAnnouncementAction, {} as AnnState);
  const [audience, setAudience] = useState(canAll ? "ALL" : "FACULTY");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div>
        <Label htmlFor="title">Заголовок</Label>
        <Input id="title" name="title" required maxLength={120} />
      </div>
      <div>
        <Label htmlFor="body">Текст</Label>
        <Textarea id="body" name="body" required maxLength={3000} className="min-h-32" />
      </div>
      <div>
        <Label htmlFor="audience">Кому</Label>
        <Select id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
          {canAll && <option value="ALL">Всем студентам</option>}
          <option value="FACULTY">Факультету</option>
          <option value="GROUP">Группе</option>
        </Select>
      </div>
      {audience === "FACULTY" && (
        <div>
          <Label htmlFor="facultyId">Факультет</Label>
          <Select id="facultyId" name="facultyId" required defaultValue="">
            <option value="" disabled>Выберите факультет</option>
            {faculties.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </div>
      )}
      {audience === "GROUP" && (
        <div>
          <Label htmlFor="groupId">Группа</Label>
          <Select id="groupId" name="groupId" required defaultValue="">
            <option value="" disabled>Выберите группу</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </div>
      )}
      <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" name="pinned" className="size-5 accent-[var(--primary)]" />
        Закрепить объявление
      </label>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton className="w-full" pendingText="Публикуем…">
        Опубликовать
      </SubmitButton>
    </form>
  );
}
