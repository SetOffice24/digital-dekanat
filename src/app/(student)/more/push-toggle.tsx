"use client";
import { useEffect, useState } from "react";
import { BellRing, Download, LoaderCircle, Smartphone } from "lucide-react";

type State = "loading" | "unsupported" | "no-server" | "ios-install" | "denied" | "off" | "on";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function urlB64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Приложение на телефоне: установить кабинет на экран и включить push-уведомления.
 * Push приходят, даже когда приложение закрыто: переносы и отмены пар, статусы заявок, новые оценки.
 * iPhone: push работают только после «На экран „Домой“» (iOS 16.4+).
 */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    (async () => {
      setInstalled(standalone());
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
        setState(isIos() && !standalone() ? "ios-install" : "unsupported");
        return;
      }
      const key = await fetch("/api/push").then((r) => r.json()).catch(() => ({ publicKey: null }));
      if (!key.publicKey) return setState("no-server");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })();
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const enable = async () => {
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      setNote("Не удалось включить. Попробуйте ещё раз или проверьте разрешения браузера.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setNote(null);
    const r = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()).catch(() => ({}));
    setNote(r.sent ? "Отправили тестовое уведомление — оно появится через пару секунд." : "Не удалось отправить тестовое уведомление.");
  };

  if (state === "loading" || state === "unsupported" || state === "no-server") return null;

  const on = state === "on";
  const hint =
    state === "ios-install"
      ? "На iPhone: «Поделиться» → «На экран „Домой“», затем откройте кабинет с экрана и включите здесь"
      : state === "denied"
        ? "Уведомления запрещены в настройках браузера для этого сайта"
        : on
          ? "Включены — переносы пар и ответы деканата придут, даже если приложение закрыто"
          : "Переносы и отмены пар, статусы заявок — сразу на телефон";

  return (
    <div>
      {/* Установка на телефон (Android/Chrome — кнопкой браузера) */}
      {!installed && install && (
        <button
          type="button"
          onClick={async () => {
            await install.prompt();
            const c = await install.userChoice;
            if (c.outcome === "accepted") setInstalled(true);
            setInstall(null);
          }}
          className="flex min-h-16 w-full items-center gap-3 border-b border-border/70 px-5 py-3 text-left hover:bg-surface-2"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-p-mint text-[#0e0e10]">
            <Download size={18} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Установить на телефон</span>
            <span className="block text-xs text-muted">Иконка на экране, открывается как приложение</span>
          </span>
        </button>
      )}

      <button
        type="button"
        disabled={busy || state === "denied" || state === "ios-install"}
        onClick={on ? disable : enable}
        className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
        role="switch"
        aria-checked={on}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-p-sky text-[#0e0e10]">{state === "ios-install" ? <Smartphone size={18} /> : <BellRing size={18} />}</span>
        <span className="flex-1">
          <span className="block font-semibold">Уведомления на телефон</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        {busy ? (
          <LoaderCircle size={20} className="animate-spin text-muted" />
        ) : (
          state !== "ios-install" && (
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-ink" : "bg-border"}`}>
              <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
            </span>
          )
        )}
      </button>
      {on && (
        <button type="button" onClick={test} className="mx-5 mb-3 text-xs font-medium text-muted underline underline-offset-2 hover:text-fg">
          Прислать тестовое уведомление
        </button>
      )}
      {note && <p className="px-5 pb-3 text-xs text-muted">{note}</p>}
    </div>
  );
}
