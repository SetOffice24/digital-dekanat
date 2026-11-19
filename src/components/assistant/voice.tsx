"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any -- Web Speech API пока без типов в lib.dom */
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };

const getRecognition = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Голосовой ввод в чат помощника: говорите — текст появляется в поле, отправляете вы.
 * Распознавание встроено в браузер (Chrome, Edge, Safari) — без ключей и платных сервисов.
 * Там, где браузер не умеет, кнопки нет.
 */
export function VoiceButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSupported(Boolean(getRecognition())), 0);
    return () => {
      clearTimeout(t);
      rec.current?.stop();
    };
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.lang = "ru-RU";
    r.interimResults = true; // текст появляется по ходу речи
    r.continuous = false; // пауза — конец фразы
    r.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(text.trim().replace(/^./, (c) => c.toUpperCase()));
    };
    r.onerror = (e: any) => setError(e?.error === "not-allowed" ? "Разрешите доступ к микрофону в браузере" : "Не расслышал — попробуйте ещё раз");
    r.onend = () => setListening(false);
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={listening ? "Остановить запись" : "Сказать голосом"}
        title={listening ? "Остановить" : "Сказать голосом (распознаёт браузер)"}
        className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-30", listening ? "bg-danger text-white" : "text-muted hover:bg-surface-2 hover:text-fg")}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" aria-hidden />}
        {listening ? <Square size={15} className="relative" /> : <Mic size={19} />}
      </button>
      {error && (
        <span role="alert" className="absolute -top-7 right-14 rounded-full bg-danger-soft px-3 py-1 text-[13px] font-medium text-danger">
          {error}
        </span>
      )}
    </>
  );
}
