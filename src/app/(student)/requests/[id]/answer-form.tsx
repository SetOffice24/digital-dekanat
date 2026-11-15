"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { answerRequestAction, type FormState } from "../actions";

export function AnswerForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(answerRequestAction.bind(null, id), {});
  return (
    <form action={action} className="mt-3 space-y-2">
      <label htmlFor="message" className="sr-only">Ваш ответ</label>
      <Textarea id="message" name="message" placeholder="Ваш ответ деканату" className="min-h-20" />
      {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending && <LoaderCircle size={16} className="animate-spin" />} Отправить ответ
      </Button>
    </form>
  );
}
