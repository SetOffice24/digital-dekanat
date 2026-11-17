import Link from "next/link";
import { Download } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups } from "@/server/repos/staff";
import { groupPhotos, photoQueue } from "@/server/repos/photos";
import { PageHeader } from "@/components/ui";
import { GroupSelect } from "@/components/staff/group-select";
import { StudentsTabs } from "@/components/staff/students-tabs";
import { fmtDate, plural } from "@/lib/utils";
import { PhotoReview } from "./review";

export const metadata = { title: "Фото студентов" };

/**
 * Фото студентов для документов: сверху — новые на проверку, ниже — группа целиком
 * (у кого фото есть — скачать для пропуска, у кого нет — видно сразу).
 */
export default async function PhotosPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const [queue, groups] = await Promise.all([photoQueue(staff), listGroups(staff)]);
  const group = groups.find((g) => g.id === sp.group) ?? groups.find((g) => g.name === "ИВТ-24-1") ?? groups[0];
  const roster = group ? await groupPhotos(staff, group.id) : [];
  const missing = roster.filter((s) => !s.approved).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <StudentsTabs active="photos" groupId={group?.id} />
      <PageHeader title="Фото для документов" subtitle="Проверка фото студентов и выгрузка для пропусков" />

      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-bold">
          На проверке{queue.length > 0 && <span className="ml-1.5 text-muted">{queue.length}</span>}
        </h2>
        {queue.length === 0 ? (
          <p className="rounded-[24px] border border-border/70 bg-surface p-5 text-sm text-muted">Новых фото нет.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {queue.map((p) => (
              <li key={p.id} className="flex min-w-0 gap-4 rounded-[24px] border border-border/70 bg-surface p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- защищённый маршрут */}
                <img src={`/api/photos/${p.id}`} alt="" width={105} height={140} className="h-[140px] w-[105px] shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <Link href={`/staff/students/${p.student.id}`} className="font-semibold hover:underline">
                      {[p.student.lastName, p.student.firstName, p.student.middleName].filter(Boolean).join(" ")}
                    </Link>
                    <div className="text-sm text-muted">
                      {p.student.group.name} · загружено {fmtDate(p.createdAt)}
                      {p.student.photos.length > 0 && " · заменит действующее"}
                    </div>
                  </div>
                  <PhotoReview id={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {group && (
        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[15px] font-bold">
              Группа {group.name}: {missing === 0 ? "фото есть у всех" : `без фото ${missing} ${plural(missing, "студент", "студента", "студентов")}`}
            </h2>
            <GroupSelect groups={groups.map((g) => ({ id: g.id, name: g.name }))} value={group.id} path="/staff/students/photos" />
          </div>
          <ul className="divide-y divide-border/60 rounded-[24px] border border-border/70 bg-surface">
            {roster.map((s) => (
              <li key={s.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                {s.approved ? (
                  // eslint-disable-next-line @next/next/no-img-element -- защищённый маршрут
                  <img src={`/api/photos/${s.approved.id}`} alt="" width={30} height={40} loading="lazy" className="h-10 w-[30px] shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="h-10 w-[30px] shrink-0 rounded-md border border-dashed border-border" />
                )}
                <Link href={`/staff/students/${s.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {s.lastName} {s.firstName} {s.middleName}
                </Link>
                {s.approved ? (
                  <a href={`/api/photos/${s.approved.id}?download=1`} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:border-ink" aria-label={`Скачать фото: ${s.lastName} ${s.firstName}`}>
                    <Download size={15} /> <span className="hidden sm:inline">Для пропуска</span>
                  </a>
                ) : (
                  <span className="shrink-0 text-sm text-muted">{s.pending ? "на проверке" : "нет фото"}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
