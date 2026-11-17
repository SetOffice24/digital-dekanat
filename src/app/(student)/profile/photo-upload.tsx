"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, Minus, Plus } from "lucide-react";

const FRAME_W = 240;
const FRAME_H = 320; // 3:4, как на пропуск и студенческий
const OUT_W = 900;
const OUT_H = 1200;

type Pos = { x: number; y: number };

/**
 * Загрузка фото для документов: выбрать снимок → подвинуть и приблизить в рамке 3:4 → отправить на проверку.
 * Обрезка — в браузере (холст), сервер всё равно перекодирует и уберёт EXIF.
 */
export function PhotoUpload({ label }: { label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const base = img ? Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight) : 1;
  const s = base * zoom;
  const clamp = (p: Pos, scale = s): Pos =>
    img ? { x: Math.min(0, Math.max(FRAME_W - img.naturalWidth * scale, p.x)), y: Math.min(0, Math.max(FRAME_H - img.naturalHeight * scale, p.y)) } : p;

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.src); }, [img]);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Нужна фотография (JPG, PNG или WebP)");
    const el = new Image();
    el.onload = () => {
      if (el.naturalWidth < 300 || el.naturalHeight < 400) return setError("Фото слишком маленькое — нужно не меньше 300×400 пикселей");
      const b = Math.max(FRAME_W / el.naturalWidth, FRAME_H / el.naturalHeight);
      setZoom(1);
      setPos({ x: (FRAME_W - el.naturalWidth * b) / 2, y: (FRAME_H - el.naturalHeight * b) / 2 });
      setImg(el);
    };
    el.onerror = () => setError("Браузер не смог открыть этот файл — сохраните фото как JPG и попробуйте снова");
    el.src = URL.createObjectURL(f);
  };

  const setZoomKeepCenter = (z: number) => {
    if (!img) return;
    const nz = Math.min(3, Math.max(1, z));
    const ns = base * nz;
    // приближаем относительно центра рамки
    const cx = (FRAME_W / 2 - pos.x) / s;
    const cy = (FRAME_H / 2 - pos.y) / s;
    setZoom(nz);
    setPos(clamp({ x: FRAME_W / 2 - cx * ns, y: FRAME_H / 2 - cy * ns }, ns));
  };

  const send = () =>
    start(async () => {
      if (!img) return;
      setError(null);
      const sw = FRAME_W / s;
      const sh = FRAME_H / s;
      if (sw < 300 || sh < 400) return setError("Слишком сильное приближение — фото получится нечётким. Уменьшите масштаб");
      const canvas = document.createElement("canvas");
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.drawImage(img, -pos.x / s, -pos.y / s, sw, sh, 0, 0, OUT_W, OUT_H);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!blob) return setError("Не удалось подготовить фото");
      const fd = new FormData();
      fd.set("photo", blob, "photo.jpg");
      const r = await fetch("/api/photos", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? "Не удалось загрузить фото");
      setImg(null);
      router.refresh();
    });

  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {!img ? (
        <button type="button" onClick={() => input.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg">
          <Camera size={17} /> {label}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Передвиньте фото пальцем или мышью: лицо — в овале, макушка и плечи видны.</p>
          <div
            className="relative mx-auto touch-none select-none overflow-hidden rounded-2xl bg-surface-2"
            style={{ width: FRAME_W, height: FRAME_H, cursor: "grab" }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр (blob:) */}
            <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left" style={{ width: img.naturalWidth * s, height: img.naturalHeight * s, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
            <svg viewBox="0 0 240 320" className="pointer-events-none absolute inset-0" aria-hidden>
              <ellipse cx="120" cy="135" rx="62" ry="82" fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 5" opacity="0.9" />
            </svg>
          </div>
          <div className="mx-auto flex max-w-[240px] items-center gap-2">
            <button type="button" aria-label="Отдалить" onClick={() => setZoomKeepCenter(zoom - 0.2)} className="flex size-9 items-center justify-center rounded-full border border-border hover:border-ink"><Minus size={16} /></button>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoomKeepCenter(Number(e.target.value))} className="flex-1 accent-[#0e0e10]" aria-label="Масштаб" />
            <button type="button" aria-label="Приблизить" onClick={() => setZoomKeepCenter(zoom + 0.2)} className="flex size-9 items-center justify-center rounded-full border border-border hover:border-ink"><Plus size={16} /></button>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" disabled={pending} onClick={send} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg disabled:opacity-50">
              {pending && <LoaderCircle size={16} className="animate-spin" />} Отправить на проверку
            </button>
            <button type="button" disabled={pending} onClick={() => input.current?.click()} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold hover:border-ink">
              Другое фото
            </button>
            <button type="button" disabled={pending} onClick={() => setImg(null)} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-muted hover:text-fg">
              Отмена
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
