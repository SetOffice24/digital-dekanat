"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveCheckinAction } from "./student-actions";

const moods = [
  { v: 1, e: "😣", l: "Тяжело" },
  { v: 2, e: "😕", l: "Так себе" },
  { v: 3, e: "😐", l: "Нормально" },
  { v: 4, e: "🙂", l: "Хорошо" },
  { v: 5, e: "😄", l: "Отлично" },
];

export function Checkin({ initial }: { initial: number | null }) {
  const [mood, setMood] = useState<number | null>(initial);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(20,24,40,0.04)] ring-1 ring-border/70 p-4">
      <div className="flex justify-between gap-1" role="radiogroup" aria-label="Самочувствие на этой неделе">
        {moods.map((m) => (
          <button
            key={m.v}
            role="radio"
            aria-checked={mood === m.v}
            disabled={pending}
            onClick={() => {
              setMood(m.v);
              start(() => saveCheckinAction(m.v));
            }}
            className={cn("flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl text-2xl transition", mood === m.v ? "bg-primary-soft ring-2 ring-primary" : "hover:bg-surface-2")}
          >
            <span aria-hidden>{m.e}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-muted">{m.l}</span>
          </button>
        ))}
      </div>
      {mood !== null && mood <= 2 && (
        <div className="mt-3 flex gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <HeartHandshake size={18} className="mt-0.5 shrink-0 text-primary" />
          <p>
            Спасибо, что поделились. Бесплатная и анонимная консультация психолога — в студенческом центре, каб. 115. Если сложно с учёбой, напишите в деканат через{" "}
            <Link href="/requests/new?type=APP_OTHER" className="font-semibold text-primary underline">обращение</Link>.
          </p>
        </div>
      )}
      {mood !== null && mood > 2 && <p className="mt-3 text-center text-sm text-muted">Отмечено. Видно только вам.</p>}
    </div>
  );
}
