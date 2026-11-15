"use client";
import { useActionState } from "react";
import { UserCheck } from "lucide-react";
import { Label, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/staff/bits";
import { assignAction, changeStatusAction, type FormState } from "./actions";

const init: FormState = {};

export function StatusForm({ id, current, options }: { id: string; current: string; options: { value: string; label: string }[] }) {
  const [state, action] = useActionState(changeStatusAction, init);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <Label htmlFor="status">Новый статус</Label>
        <Select id="status" name="status" defaultValue={options.find((o) => o.value !== current)?.value} required>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="message">Комментарий студенту</Label>
        <Textarea id="message" name="message" maxLength={1000} placeholder="Необязательно, но обязательно для «Нужно уточнение» и «Отклонена»" />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton className="w-full" pendingText="Отправляем…">
        Сменить статус
      </SubmitButton>
    </form>
  );
}

export function AssignForm({ id }: { id: string }) {
  const [state, action] = useActionState(assignAction, init);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" className="w-full" pendingText="Назначаем…">
        <UserCheck size={18} /> Назначить себя исполнителем
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
