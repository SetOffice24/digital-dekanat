"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

/** Выбор группы — сразу показывает её посещаемость. */
export function GroupSelect({ groups, value }: { groups: { id: string; name: string }[]; value?: string }) {
  const router = useRouter();
  return (
    <Select aria-label="Группа" value={value} onChange={(e) => router.push(`/staff/attendance?group=${e.target.value}`)} className="w-full sm:w-48">
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );
}
