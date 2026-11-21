import { isHeading } from "@/server/knowledge/text";

/** Текст материала: заголовки разделов и абзацы (как их видит помощник). */
export function DocBody({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const head = isHeading(lines[0]) && (lines.length > 1 || blocks.length > 1) ? lines.shift()!.replace(/^#{1,4}\s*/, "") : null;
        return (
          <section key={i}>
            {head && <h2 className="mb-1 mt-5 font-head text-lg font-semibold first:mt-0">{head}</h2>}
            {lines.length > 0 && <p className="whitespace-pre-line">{lines.join("\n")}</p>}
          </section>
        );
      })}
    </div>
  );
}
