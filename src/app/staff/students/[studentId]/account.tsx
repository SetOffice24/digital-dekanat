"use client";
import { useState, useTransition } from "react";
import { ArrowRightLeft, KeyRound, LoaderCircle, Lock, LockOpen } from "lucide-react";
import { Select } from "@/components/ui";
import { CredentialsCard } from "@/components/staff/credentials-card";
import { blockAction, resetPasswordAction, transferAction, unblockAction } from "../accounts/actions";

type Mode = "idle" | "reset" | "transfer" | "block";
const BLOCK_REASONS = ["Подозрение на вход посторонних", "По заявлению студента", "Ожидается приказ об отчислении"];

/** Действия с аккаунтом в личном деле: временный пароль, перевод, блокировка. Каждое — с подтверждением. */
export function AccountControls(p: { studentId: string; login: string; blocked: boolean; groupId: string; subgroup: number; groups: { id: string; name: string; course: number }[] }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [groupId, setGroupId] = useState(p.groupId);
  const [subgroup, setSubgroup] = useState(p.subgroup);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; password?: string } | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok?: string; error?: string; password?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (!r.error) setMode("idle");
    });
  const open = (m: Mode) => {
    setMsg(null);
    setMode(mode === m ? "idle" : m);
  };
  const target = p.groups.find((g) => g.id === groupId);
  const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition";
  const confirmBtn = "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => open("reset")} className={`${btn} ${mode === "reset" ? "border-ink" : "border-border hover:border-ink"}`}>
          <KeyRound size={15} /> Временный пароль
        </button>
        <button type="button" onClick={() => open("transfer")} className={`${btn} ${mode === "transfer" ? "border-ink" : "border-border hover:border-ink"}`}>
          <ArrowRightLeft size={15} /> Перевести
        </button>
        {p.blocked ? (
          <button type="button" disabled={pending} onClick={() => window.confirm("Снять блокировку? Студент снова сможет войти.") && act(() => unblockAction(p.studentId))} className={`${btn} border-border hover:border-ink`}>
            <LockOpen size={15} /> Разблокировать
          </button>
        ) : (
          <button type="button" onClick={() => open("block")} className={`${btn} ${mode === "block" ? "border-danger text-danger" : "border-border text-danger hover:border-danger"}`}>
            <Lock size={15} /> Заблокировать
          </button>
        )}
      </div>

      {mode === "reset" && (
        <div className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
          <p>Студент выйдет со всех устройств и при входе по временному паролю задаст свой. Нужен, если студент забыл пароль или его не получал.</p>
          <button type="button" disabled={pending} onClick={() => act(() => resetPasswordAction(p.studentId))} className={`${confirmBtn} bg-ink text-ink-fg`}>
            {pending && <LoaderCircle size={15} className="animate-spin" />} Выдать временный пароль
          </button>
        </div>
      )}

      {mode === "transfer" && (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-4 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select aria-label="Группа" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full sm:w-48">
              {p.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.course} курс
                </option>
              ))}
            </Select>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Подгруппа">
              {[1, 2].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={subgroup === n} onClick={() => setSubgroup(n)} className={`min-h-10 rounded-full border px-4 font-medium ${subgroup === n ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface"}`}>
                  {n} подгр.
                </button>
              ))}
            </div>
          </div>
          <p className="text-muted">
            {groupId === p.groupId
              ? "Сменится только подгруппа — и расписание вместе с ней."
              : "Оценки, посещаемость и сданные работы сохранятся. Расписание, задания и материалы — сразу по новой группе; дисциплины, которых не было, добавятся в «Учёбу». Студент получит уведомление."}
          </p>
          <button
            type="button"
            disabled={pending || (groupId === p.groupId && subgroup === p.subgroup)}
            onClick={() => window.confirm(`Перевести в ${target?.name ?? ""}, подгруппу ${subgroup}?`) && act(() => transferAction(p.studentId, groupId, subgroup))}
            className={`${confirmBtn} bg-ink text-ink-fg`}
          >
            {pending && <LoaderCircle size={15} className="animate-spin" />} Перевести
          </button>
        </div>
      )}

      {mode === "block" && (
        <div className="space-y-2 rounded-2xl bg-danger-soft/60 p-4 text-sm">
          <p>Вход закроется сразу на всех устройствах, push-уведомления отключатся. Оценки, заявки и сообщения сохранятся; разблокировать можно в любой момент.</p>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1 text-xs font-medium ${reason === r ? "border-ink bg-ink text-ink-fg" : "border-border bg-surface hover:border-ink"}`}>
                {r}
              </button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Причина (видна в журнале)" className="min-h-10 w-full rounded-xl bg-surface px-3 outline-none focus:ring-2 focus:ring-ink/30" />
          <button type="button" disabled={pending} onClick={() => act(() => blockAction(p.studentId, reason))} className={`${confirmBtn} bg-danger text-white`}>
            {pending && <LoaderCircle size={15} className="animate-spin" />} Заблокировать
          </button>
        </div>
      )}

      {msg?.password && <CredentialsCard login={p.login} password={msg.password} />}
      {msg?.ok && !msg.password && <p className="text-sm font-medium text-success">{msg.ok}</p>}
      {msg?.error && <p className="text-sm font-medium text-danger">{msg.error}</p>}
    </div>
  );
}
