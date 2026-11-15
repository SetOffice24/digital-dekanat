/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * Иконка ИИ-помощника: пузырь сообщения со звездой.
 * Сгенерирована нейросетью OpenAI (gpt-image) по промпту команды, уменьшена до 256×256 WebP (~10 КБ).
 * Исходник — docs/assistant-icon-source.png.
 */
export function Mascot({ size = 40, className, thinking }: { size?: number; className?: string; thinking?: boolean }) {
  return (
    <img
      src="/ai/assistant.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 select-none object-contain", thinking && "animate-pulse", className)}
      style={{ width: size, height: size }}
    />
  );
}
