"use client";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { recognizeAbsenceAction, saveAttendanceAction } from "./actions";
import type { AbsenceGuess } from "@/server/ai/attendance";

type S = { id: string; name: string; present: boolean | null };

/**
 * Отметка посещаемости: по умолчанию все «были», нажатие по строке — «нет».
 * Сверху — помощник: пишете «нет Зорина и Лесновой», он показывает, кого понял, и предлагает кнопку.
 * Сохраняет всегда человек.
 */
export function AttendanceForm({ lessonId, students, marked }: { lessonId: string; students: S[]; marked: boolean }) {
  const [absent, setAbsent] = useState<Set<string>>(() => new Set(students.filter((s) => s.present === false).map((s) => s.id)));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [saving, startSave] = useTransition();
  const [text, setText] = useState("");
  const [guess, setGuess] = useState<AbsenceGuess | null>(null);
  const [guessErr, setGuessErr] = useState<string | null>(null);
  const [thinking, startThink] = useTransition();
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "";

  const save = (ids: string[]) =>
    startSave(async () => {
      setMsg(await saveAttendanceAction(lessonId, ids));
    });

  const toggle = (id: string) => {
    setMsg({});
    setAbsent((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const recognize = () =>
    startThink(async () => {
      setGuess(null);
      setGuessErr(null);
      const r = await recognizeAbsenceAction(lessonId, text);
      if (r.error) setGuessErr(r.error);
      else if (r.guess) setGuess(r.guess);
    });

  return (
    <div className="space-y-5">
      {/* Помощник */}
      <section className="rounded-[28px] bg-p-yellow/60 p-4 sm:p-5">
        <label htmlFor="ai-att" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={16} /> Скажите помощнику, кого нет
        </label>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) recognize();
          }}
        >
          <input id="ai-att" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Кого нет на паре?" className="min-h-12 min-w-0 flex-1 rounded-full bg-surface px-4 text-[15px] outline-none focus:ring-2 focus:ring-ink/30" />
          <button type="submit" disabled={thinking || !text.trim()} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-40">
            {thinking && <LoaderCircle size={16} className="animate-spin" />}
            Распознать
          </button>
        </form>
        <p className="mt-1.5 px-1 text-xs text-fg/60">Например: «нет Зорина Даниила и Лесновой», «были только Зорин и Рябинин», «все были».</p>
        {guessErr && <p className="mt-2 text-sm font-medium text-danger">{guessErr}</p>}
        {guess && (
          <div className="mt-3 rounded-2xl bg-surface p-4" role="status">
            <p className="text-sm text-muted">Помощник понял так — проверьте ФИО:</p>
            {guess.absentIds.length ? (
              <ul className="mt-2 space-y-1">
                {guess.absentIds.map((id) => (
                  <li key={id} className="flex items-center gap-2 font-medium">
                    <X size={15} className="text-danger" /> {nameOf(id)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 font-medium">Все на месте</p>
            )}
            <p className="mt-2 text-sm text-muted">Остальные {students.length - guess.absentIds.length} — присутствуют.</p>
            {guess.unclear.length > 0 && <p className="mt-2 text-sm font-medium text-warning">Не понял, кто это: {guess.unclear.join(", ")} — отметьте вручную в списке.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setAbsent(new Set(guess.absentIds));
                  save(guess.absentIds);
                  setGuess(null);
                  setText("");
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-40"
              >
                <Check size={16} /> Отметить и сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setAbsent(new Set(guess.absentIds));
                  setGuess(null);
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold hover:border-ink"
              >
                Поправить в списке
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">{guess.source === "gateway" ? "Распознано нейросетью" : "Распознано по фамилиям (без нейросети)"} · сохраняете вы</p>
          </div>
        )}
      </section>

      {/* Список группы */}
      <div>
        <p className="mb-2 text-sm text-muted">{marked ? "Отметки уже есть — можно поправить." : "По умолчанию все присутствуют. Нажмите на студента, которого нет."}</p>
        <ol className="overflow-hidden rounded-[28px] border border-border/70 bg-surface">
          {students.map((s, i) => {
            const off = absent.has(s.id);
            return (
              <li key={s.id} className={cn(i > 0 && "border-t border-border/60")}>
                <button type="button" onClick={() => toggle(s.id)} aria-pressed={off} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition sm:px-5", off ? "bg-danger-soft/60" : "hover:bg-surface-2/60")}>
                  <span className="w-6 shrink-0 text-sm text-muted tabular-nums">{i + 1}</span>
                  <span className={cn("min-w-0 flex-1 font-medium", off && "text-danger")}>{s.name}</span>
                  <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", off ? "bg-danger text-white" : "bg-success-soft text-success")}>{off ? "Нет" : "Был"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-border/70 bg-bg/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <span className={cn("min-w-0 flex-1 text-sm", msg.error ? "font-medium text-danger" : msg.ok ? "font-medium text-success" : "text-muted")}>
          {msg.error ?? msg.ok ?? (
            <>
              Отсутствуют: <b className="text-fg">{absent.size}</b> из {students.length}
            </>
          )}
        </span>
        <button type="button" disabled={saving} onClick={() => save([...absent])} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-ink-fg transition hover:opacity-90 disabled:opacity-40">
          {saving && <LoaderCircle size={17} className="animate-spin" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}
