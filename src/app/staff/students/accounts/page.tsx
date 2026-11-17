import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { listGroups } from "@/server/repos/staff";
import { ACCOUNT_FILTERS, ACTION_LABEL, accountsOverview, recentAccountEvents, type AccountFilter } from "@/server/repos/accounts";
import { PageHeader, Select } from "@/components/ui";
import { StudentsTabs } from "@/components/staff/students-tabs";
import { cn, fmtDateTime, fmtShort, plural } from "@/lib/utils";

export const metadata = { title: "Аккаунты студентов" };

/**
 * Аккаунты студентов: сводка (кто не входил, кто заблокирован, у кого временный пароль, без фото),
 * нажатие на цифру — список этих студентов; действия — в личном деле. Внизу — последние действия деканата.
 */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ group?: string; f?: string; q?: string }> }) {
  const { staff } = await requireStaff();
  const sp = await searchParams;
  const groups = await listGroups(staff);
  const group = groups.find((g) => g.id === sp.group);
  const filter = ACCOUNT_FILTERS.some((x) => x.key === sp.f) ? (sp.f as AccountFilter) : undefined;
  const [{ stats, rows }, events] = await Promise.all([accountsOverview(staff, { groupId: group?.id, filter, q: sp.q }), recentAccountEvents(staff)]);
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ group: group?.id, f: filter, q: sp.q, ...p })) if (v) q.set(k, v);
    const s = q.toString();
    return `/staff/students/accounts${s ? `?${s}` : ""}`;
  };
  const tiles: { key?: AccountFilter; value: number; label: string; bad?: boolean }[] = [
    { value: stats.total, label: plural(stats.total, "студент", "студента", "студентов") },
    { value: stats.active7, label: "заходили за 7 дней" },
    { key: "never", value: stats.never, label: "ни разу не входили", bad: stats.never > 0 },
    { key: "inactive", value: stats.inactive, label: "не заходили 14 дней", bad: stats.inactive > 0 },
    { key: "temp", value: stats.temp, label: "ждут смены пароля" },
    { key: "blocked", value: stats.blocked, label: "заблокированы" },
    { key: "nophoto", value: stats.nophoto, label: "без фото" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <StudentsTabs active="accounts" groupId={group?.id} />
      <PageHeader
        title="Аккаунты"
        subtitle={group ? `Группа ${group.name}` : "Все студенты, к которым у вас есть доступ"}
        action={
          <Link href={`/staff/students/accounts/new${group ? `?group=${group.id}` : ""}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg">
            <UserPlus size={17} /> Добавить студента
          </Link>
        }
      />

      {/* Сводка: каждая цифра — фильтр списка */}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-7">
        {tiles.map((t) => {
          const active = t.key ? filter === t.key : !filter && t === tiles[0];
          return (
            <Link key={t.label} href={href({ f: t.key && filter !== t.key ? t.key : undefined })} className={cn("w-[132px] shrink-0 rounded-2xl border p-3 transition sm:w-auto", active ? "border-ink bg-surface" : "border-border/70 bg-surface hover:border-ink/40")}>
              <div className={cn("font-head text-2xl font-semibold tabular-nums", t.bad && "text-danger")}>{t.value}</div>
              <div className="text-xs text-muted">{t.label}</div>
            </Link>
          );
        })}
      </div>

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/staff/students/accounts">
        {filter && <input type="hidden" name="f" value={filter} />}
        <Select name="group" defaultValue={group?.id ?? ""} aria-label="Группа" className="w-full sm:w-48">
          <option value="">Все группы</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-1 gap-2">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Фамилия, логин или № зачётки" className="min-h-13 w-full min-w-0 rounded-2xl border border-border bg-surface px-4 text-[15px] outline-none focus:ring-2 focus:ring-ink/30" />
          <button className="inline-flex min-h-13 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-fg">
            <Search size={16} /> <span className="hidden sm:inline">Найти</span>
          </button>
        </div>
      </form>

      {filter && <p className="mb-3 text-sm text-muted">{ACCOUNT_FILTERS.find((x) => x.key === filter)?.hint}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {rows.length === 0 ? (
            <p className="rounded-[24px] border border-border/70 bg-surface p-5 text-sm text-muted">{filter || sp.q ? "Никого не нашлось." : "Студентов пока нет."}</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-[24px] border border-border/70 bg-surface">
              {rows.map((s) => {
                const u = s.user;
                const status = u.blockedAt
                  ? { text: "заблокирован", cls: "bg-danger-soft text-danger" }
                  : u.mustChangePassword
                    ? { text: "временный пароль", cls: "bg-p-yellow text-[#0e0e10]" }
                    : !u.lastLoginAt
                      ? { text: "не входил(а)", cls: "bg-surface-2 text-muted" }
                      : null;
                return (
                  <li key={s.id}>
                    <Link href={`/staff/students/${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {s.lastName} {s.firstName} {s.middleName}
                        </div>
                        <div className="truncate text-xs text-muted">
                          {s.group.name} · {u.login}
                          {s.photos.length === 0 && " · без фото"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {status && <span className={cn("rounded-full px-2 py-0.5 font-semibold", status.cls)}>{status.text}</span>}
                        {u.lastLoginAt && <div className={cn("mt-0.5 text-muted", s.stale && "font-semibold text-danger")}>вход {fmtShort(u.lastLoginAt)}</div>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length === 200 && <p className="mt-2 text-xs text-muted">Показаны первые 200 — уточните группу или поиск.</p>}
        </section>

        <aside>
          <h2 className="mb-2 text-[15px] font-bold">Последние действия</h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted">Пока ничего.</p>
          ) : (
            <ul className="space-y-2 rounded-[24px] border border-border/70 bg-surface p-4 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/staff/students/${e.student.id}`} className="font-medium hover:underline">
                    {e.student.lastName} {e.student.firstName}
                  </Link>
                  : {ACTION_LABEL[e.action].toLowerCase()}
                  {e.details ? ` (${e.details})` : ""}
                  <div className="text-xs text-muted">
                    {fmtDateTime(e.createdAt)} · {e.actor.staff?.fullName ?? (e.actor.student ? "сам студент" : e.actor.login)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
