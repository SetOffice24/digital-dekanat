"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

/** Выбор группы — сразу открывает тот же экран для выбранной группы (остальные параметры сбрасываются). */
export function GroupSelect({ groups, value, path, className = "w-full sm:w-48" }: { groups: { id: string; name: string }[]; value?: string; path: string; className?: string }) {
  const router = useRouter();
  return (
    <Select aria-label="Группа" value={value} onChange={(e) => router.push(`${path}?group=${e.target.value}`)} className={className}>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );
}
