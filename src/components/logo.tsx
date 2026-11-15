/** Собственный знак «Универа»: буква «У» в виде раскрытой книги. Не копирует логотипы реальных вузов. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M8 9.5c3 0 5.6.9 8 2.6 2.4-1.7 5-2.6 8-2.6v12.4c-3 0-5.6.9-8 2.6-2.4-1.7-5-2.6-8-2.6z" fill="none" stroke="var(--primary-fg)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 13l4 5 4-5M16 18v6.3" fill="none" stroke="var(--primary-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
