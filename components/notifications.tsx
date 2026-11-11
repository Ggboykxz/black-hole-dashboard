"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Live, Snapshot } from "@/lib/types";
import { buildAlerts, type Alert, type Level } from "@/lib/alerts";
import { readSeenAlerts, writeSeenAlerts } from "@/lib/live-store";
import { useLiveFeed } from "./live-provider";
import { describeChange } from "@/lib/changes";

const TONE: Record<
  Level,
  { text: string; border: string; bg: string; dot: string; label: string }
> = {
  info: {
    text: "text-accent",
    border: "border-accent/35",
    bg: "bg-accent/[0.07]",
    dot: "bg-accent",
    label: "info",
  },
  warn: {
    text: "text-warn",
    border: "border-warn/40",
    bg: "bg-warn/[0.07]",
    dot: "bg-warn",
    label: "vigilance",
  },
  critical: {
    text: "text-bad",
    border: "border-bad/50",
    bg: "bg-bad/[0.08]",
    dot: "bg-bad",
    label: "critique",
  },
};

const ORDER: Level[] = ["critical", "warn", "info"];

function humanAge(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—";
  if (s < 1) return "à l'instant";
  if (s < 90) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} j`;
}

function worstOf(alerts: Alert[]): Level | null {
  for (const level of ORDER) {
    if (alerts.some((a) => a.level === level)) return level;
  }
  return null;
}

/**
 * The notification centre.
 *
 * It polls the live endpoint, evaluates the measurement rules
 * (`lib/alerts.ts`) and keeps a **persisted acknowledgement journal**: a
 * notification the user marked as read stays read across reloads, and the
 * unread count only covers conditions that are still true. When a condition
 * clears, its acknowledgement is dropped — if it comes back, it is news
 * again, not a greyed-out ghost.
 *
 * Rules that keep it quiet:
 * * a toast is raised for a *new* non-info condition only, once;
 * * browser notifications are strictly opt-in and every API touch is guarded
 *   (`Notification` is absent on some browsers, and `requestPermission()`
 *   throws inside cross-origin iframes);
 * * the poll effect never depends on state, so the interval cannot churn.
 */
export default function Notifications({ snapshot }: { snapshot: Snapshot }) {
  const feed = useLiveFeed();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"alerts" | "changes">("alerts");
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<{ alert: Alert; at: number }[]>([]);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [copied, setCopied] = useState<string | null>(null);

  const snapshotRef = useRef(snapshot);
  const seenRef = useRef<Record<string, number>>({});
  const permRef = useRef<NotificationPermission | "unsupported">("default");
  const knownRef = useRef<Set<string>>(new Set());
  const firstPoll = useRef(true);
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const knownChangeRef = useRef<Set<string>>(new Set());

  snapshotRef.current = snapshot;
  permRef.current = perm;

  const commitSeen = useCallback((next: Record<string, number>) => {
    seenRef.current = next;
    setSeen(next);
    writeSeenAlerts(next);
  }, []);

  // ---- restore the acknowledgement journal + permission state ------------
  useEffect(() => {
    const stored = readSeenAlerts();
    seenRef.current = stored;
    setSeen(stored);
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        setPerm(Notification.permission);
        permRef.current = Notification.permission;
      } catch {
        setPerm("unsupported");
        permRef.current = "unsupported";
      }
    } else {
      setPerm("unsupported");
      permRef.current = "unsupported";
    }
  }, []);

  // ---- the rules, recomputed whenever the shared feed changes -------------
  useEffect(() => {
    /* seules les mesures reçues valent alerte : avant le premier
       poll, `feed.live` est le journal restauré, dont l'âge est
       l'âge de la copie — l'alerter dessus reviendrait à annoncer
       « signal figé depuis 340 s » sur un run qui écrit. Tant que
       le premier poll n'a pas répondu, on n'alerte rien : le
       silence de quelques secondes n'est pas un incident. */
    const active = feed.verified ? buildAlerts(feed.live, snapshotRef.current) : [];
    setAlerts(active);

    const now = Date.now();
    const ids = new Set(active.map((a) => a.id));
    for (const a of active) {
      if (!firstSeenRef.current.has(a.id)) firstSeenRef.current.set(a.id, now);
    }
    for (const id of [...firstSeenRef.current.keys()]) {
      if (!ids.has(id)) firstSeenRef.current.delete(id);
    }

    // drop acknowledgements for conditions that are no longer true
    let pruned = false;
    for (const id of Object.keys(seenRef.current)) {
      if (id.startsWith("chg:")) continue; // a movement stays acknowledged
      if (!ids.has(id)) {
        delete seenRef.current[id];
        pruned = true;
      }
    }
    if (pruned) {
      setSeen({ ...seenRef.current });
      writeSeenAlerts(seenRef.current);
    }

    // a live condition is news once; it may become news again if it clears
    for (const id of [...knownRef.current]) {
      if (!ids.has(id)) knownRef.current.delete(id);
    }

    if (firstPoll.current) {
      firstPoll.current = false;
      active.forEach((a) => knownRef.current.add(a.id));
      return;
    }

    const fresh = active.filter(
      (a) => !knownRef.current.has(a.id) && !seenRef.current[a.id],
    );
    active.forEach((a) => knownRef.current.add(a.id));

    if (fresh.length) {
      const loud = fresh.filter((a) => a.level !== "info");
      if (loud.length) {
        setToasts((list) => {
          const known = new Set(list.map((t) => t.alert.id));
          const added = loud
            .filter((a) => !known.has(a.id))
            .map((alert) => ({ alert, at: Date.now() }));
          return [...list, ...added].slice(-3);
        });
      }
      if (permRef.current === "granted" && typeof Notification !== "undefined") {
        loud
          .filter((a) => a.level === "critical")
          .forEach((a) => {
            try {
              new Notification(a.title, {
                body: a.detail,
                tag: a.id,
                silent: false,
              });
            } catch {
              /* the browser refused — the toast remains */
            }
          });
      }
    }
  }, [feed.live]);

  // ---- every movement, not only the thresholds ----------------------------
  /**
   * The alert rules watch the *thresholds*; this watches the *values*. A
   * measurement can move a lot without crossing a line (the loss drops by
   * 0,03 nats), and that movement is news the user asked for: it is listed
   * here, in full, with the exact before/after.
   */
  const changeItems = useMemo(
    () =>
      feed.changes.map((c) => ({
        id: `chg:${c.id}`,
        changeId: c.id,
        level: (c.level === "warn" ? "warn" : "info") as Level,
        title: c.label,
        detail: describeChange(c),
        origin: c.origin,
        t: c.t,
        trend: c.trend,
      })),
    [feed.changes],
  );

  // a toast for every threshold crossing, and for nothing else: a toast per
  // modified value would be noise, a list is not.
  useEffect(() => {
    const loud = changeItems.filter(
      (c) => c.level === "warn" && !knownChangeRef.current.has(c.changeId),
    );
    changeItems.forEach((c) => knownChangeRef.current.add(c.changeId));
    if (!loud.length) return;
    setToasts((list) => {
      const known = new Set(list.map((t) => t.alert.id));
      const added = loud
        .filter((c) => !known.has(c.id))
        .map((c) => ({
          alert: {
            id: c.id,
            level: c.level,
            title: `${c.title} — seuil franchi`,
            detail: c.detail,
          },
          at: Date.now(),
        }));
      return [...list, ...added].slice(-3);
    });
  }, [changeItems]);

  // ---- toasts retire on their own (and never pile up) --------------------
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setToasts((list) => {
        const next = list.filter((x) => now - x.at < 9000);
        return next.length === list.length ? list : next;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // ---- Escape + outside click close --------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ---- the copilot can open the centre -----------------------------------
  useEffect(() => {
    const openCentre = () => setOpen(true);
    window.addEventListener("bh:notifications-open", openCentre);
    return () =>
      window.removeEventListener("bh:notifications-open", openCentre);
  }, []);

  // ---- actions -----------------------------------------------------------
  const acknowledge = useCallback(
    (id: string) => {
      const next = { ...seenRef.current, [id]: Date.now() };
      commitSeen(next);
      setToasts((list) => list.filter((t) => t.alert.id !== id));
    },
    [commitSeen],
  );

  const acknowledgeAll = useCallback(() => {
    const now = Date.now();
    const next = { ...seenRef.current };
    alerts.forEach((a) => {
      next[a.id] = now;
    });
    commitSeen(next);
    setToasts([]);
  }, [alerts, commitSeen]);

  const copy = useCallback(async (a: Alert) => {
    if (!a.action) return;
    // the action is a shell command in backticks — copy the command, not the prose
    const cmd = a.action.match(/`([^`]+)`/)?.[1] ?? a.action;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(a.id);
      window.setTimeout(() => setCopied((c) => (c === a.id ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  }, []);

  const askPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      permRef.current = p;
    } catch {
      setPerm("unsupported");
      permRef.current = "unsupported";
    }
  }, []);

  const unread = alerts.filter((a) => !seen[a.id]);
  const unreadChanges = changeItems.filter((c) => !seen[c.id]);
  const worst = worstOf(alerts);
  const unreadWorst = worstOf([
    ...unread,
    ...unreadChanges.map((c) => ({ level: c.level }) as Alert),
  ]);
  const counts = ORDER.map((level) => ({
    level,
    n: alerts.filter((a) => a.level === level).length,
  })).filter((c) => c.n > 0);
  const unreadTotal = unread.length + unreadChanges.length;

  const acknowledgeChanges = useCallback(
    (ids: string[]) => {
      const next = { ...seenRef.current };
      const now = Date.now();
      ids.forEach((id) => {
        next[id] = now;
      });
      commitSeen(next);
    },
    [commitSeen],
  );

  return (
    <div className="relative" data-bot-target="notifications">
      {/* ------------------------------------------------------- toasts */}
      {/* toasts — sous la barre d'état, pas sur elle : à top-14 ils
         recouvraient la pause du direct qui vit au bout de cette
         barre (les deux sont en haut à droite, l'alerte volante
         mangeait la commande) */}
      <div className="pointer-events-none fixed right-3 top-24 z-[60] flex w-[calc(100vw-1.5rem)] max-w-[350px] flex-col gap-2 sm:right-4">
        {toasts.map(({ alert }) => {
          const tone = TONE[alert.level];
          return (
            <div
              key={alert.id}
              role="status"
              className={`pointer-events-auto overflow-hidden rounded-xl border ${tone.border} ${tone.bg} p-3 shadow-2xl backdrop-blur-xl`}
              style={{ animation: "toastIn 240ms cubic-bezier(.2,.9,.3,1)" }}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[12px] font-medium ${tone.text}`}>
                    {alert.title}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-dim">
                    {alert.detail}
                  </p>
                </div>
                <button
                  onClick={() => acknowledge(alert.id)}
                  aria-label="marquer comme lu"
                  title="marquer comme lu"
                  className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {alert.action ? (
                <button
                  onClick={() => copy(alert)}
                  title="copier la commande"
                  className="mt-2 block w-full truncate rounded-md border border-line bg-[#0a0d12] px-2 py-1 text-left font-mono text-[9.5px] leading-relaxed text-accent/90 transition-colors hover:border-accent/40"
                >
                  {copied === alert.id ? "✓ commande copiée" : alert.action}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* --------------------------------------------------------- bell */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unreadTotal
            ? `${unreadTotal} notification${unreadTotal > 1 ? "s" : ""} non lue${unreadTotal > 1 ? "s" : ""}`
            : "notifications"
        }
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          unreadWorst === "critical"
            ? "border-bad/50 bg-bad/10 text-bad"
            : unreadWorst === "warn"
              ? "border-warn/45 bg-warn/[0.08] text-warn"
              : unreadWorst === "info"
                ? "border-accent/40 bg-accent/[0.07] text-accent"
                : "border-line text-dim hover:border-accent/40 hover:text-ink"
        }`}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          style={
            unreadWorst === "critical"
              ? { animation: "bellRing 2.8s ease-in-out infinite", transformOrigin: "50% 20%" }
              : undefined
          }
        >
          <path
            d="M18 8.5a6 6 0 1 0-12 0c0 4.2-1.6 5.8-2.4 6.6-.4.4-.1 1 .4 1h16c.5 0 .8-.6.4-1-.8-.8-2.4-2.4-2.4-6.6Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 19.2a2.6 2.6 0 0 0 5 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unreadTotal ? (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-bg ${
              unreadWorst === "critical"
                ? "bg-bad"
                : unreadWorst === "warn"
                  ? "bg-warn"
                  : "bg-accent"
            }`}
          >
            {unreadTotal > 9 ? "9+" : unreadTotal}
          </span>
        ) : null}
      </button>

      {/* -------------------------------------------------------- panel */}
      {open ? (
        <>
          {/* backdrop: closes on any outside click, transparent on desktop */}
          <button
            aria-label="fermer les notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-bg/50 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0"
            tabIndex={-1}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="centre de notifications"
            className="fixed left-3 right-3 top-[54px] z-50 flex max-h-[calc(100dvh-4.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-panel2/97 shadow-2xl backdrop-blur-xl sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-[392px]"
            style={{ animation: "panelIn 180ms cubic-bezier(.2,.9,.3,1)" }}
          >
            {/* header */}
            <div className="flex items-start justify-between gap-3 border-b border-line px-3.5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[12.5px] font-medium text-ink">
                    Centre de notifications
                  </h2>
                  {unreadTotal ? (
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                      {unreadTotal} non lue{unreadTotal > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[10px] text-faint">
                  {tab === "alerts"
                    ? alerts.length === 0
                      ? "aucune alerte active"
                      : `${alerts.length} règle${alerts.length > 1 ? "s" : ""} sur mesures réelles`
                    : `${changeItems.length} mouvement${changeItems.length > 1 ? "s" : ""} détecté${changeItems.length > 1 ? "s" : ""} — chaque valeur modifiée`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {tab === "alerts" && unread.length ? (
                  <button
                    onClick={acknowledgeAll}
                    className="rounded-md px-2 py-1 text-[10px] text-dim transition-colors hover:bg-white/5 hover:text-ink"
                  >
                    tout lire
                  </button>
                ) : null}
                {tab === "changes" && unreadChanges.length ? (
                  <button
                    onClick={() => acknowledgeChanges(unreadChanges.map((c) => c.id))}
                    className="rounded-md px-2 py-1 text-[10px] text-dim transition-colors hover:bg-white/5 hover:text-ink"
                  >
                    tout lire
                  </button>
                ) : null}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="fermer"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-ink"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* severity summary */}
            {tab === "alerts" && counts.length ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line/70 px-3.5 py-2">
                {counts.map(({ level, n }) => {
                  const tone = TONE[level];
                  return (
                    <span
                      key={level}
                      className={`inline-flex items-center gap-1.5 rounded-full border ${tone.border} ${tone.bg} px-2 py-0.5 text-[9.5px] ${tone.text}`}
                    >
                      <span className={`h-1 w-1 rounded-full ${tone.dot}`} />
                      {n} {tone.label}
                      {n > 1 ? "s" : ""}
                    </span>
                  );
                })}
                <span className="ml-auto text-[9.5px] text-faint">
                  {worst ? "pire niveau actif" : ""}
                </span>
              </div>
            ) : null}

            {/* list */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
              {tab === "changes" ? (
                changeItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <span className="pulse pulse-static" style={{ background: "#64708a" }} />
                    <p className="max-w-[280px] text-[11px] leading-relaxed text-dim">
                      Aucun mouvement détecté pour l&apos;instant. Une ligne
                      apparaît ici à chaque valeur modifiée — le log du trainer
                      n&apos;écrit qu&apos;une ligne toutes les 10 steps.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {changeItems.map((c) => {
                      const read = Boolean(seen[c.id]);
                      const tone = TONE[c.level];
                      return (
                        <li
                          key={c.id}
                          className={`flex items-start gap-2 rounded-md border px-2 py-1.5 transition-opacity ${
                            read ? "border-line/50 opacity-50" : tone.border
                          } ${read ? "" : tone.bg}`}
                        >
                          <span
                            className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span
                                  className={`truncate text-[11px] font-medium ${
                                    read ? "text-dim" : tone.text
                                  }`}
                                >
                                  {c.title}
                                </span>
                                <span className="shrink-0 rounded-full border border-line px-1 py-[0.5px] font-mono text-[8px] text-faint">
                                  {c.origin}
                                </span>
                              </span>
                              <span className="num shrink-0 font-mono text-[9px] text-faint">
                                {new Date(c.t).toLocaleTimeString("fr-FR")}
                              </span>
                            </div>
                            <p className="num mt-0.5 text-[10px] leading-relaxed text-dim">
                              {c.detail}
                            </p>
                          </div>
                          <button
                            onClick={() => acknowledgeChanges([c.id])}
                            className="shrink-0 text-[9px] text-faint transition-colors hover:text-accent"
                          >
                            {read ? "lu" : "lire"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="pulse" />
                  <p className="max-w-[260px] text-[11px] leading-relaxed text-dim">
                    Rien à signaler : la session est vivante, la carte est dans
                    ses limites, le disque a de la place.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {ORDER.flatMap((level) =>
                    alerts.filter((a) => a.level === level),
                  ).map((a) => {
                    const tone = TONE[a.level];
                    const read = Boolean(seen[a.id]);
                    const stamp = firstSeenRef.current.get(a.id);
                    const elapsed =
                      a.since_s && a.since_s > 0
                        ? a.since_s
                        : stamp
                          ? (Date.now() - stamp) / 1000
                          : null;
                    return (
                      <li
                        key={a.id}
                        className={`rounded-lg border p-2.5 transition-opacity ${tone.border} ${
                          read ? "bg-transparent opacity-55" : tone.bg
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot} ${
                              read ? "" : "shadow-[0_0_8px_currentColor]"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <div
                                className={`text-[11.5px] font-medium ${read ? "text-dim" : tone.text}`}
                              >
                                {a.title}
                              </div>
                              <span className="shrink-0 font-mono text-[9px] text-faint">
                                {elapsed !== null ? humanAge(elapsed) : ""}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10.5px] leading-relaxed text-dim">
                              {a.detail}
                            </p>
                            {a.action ? (
                              <button
                                onClick={() => copy(a)}
                                title="copier la commande"
                                className="mt-1.5 flex w-full items-center gap-1.5 rounded-md border border-line bg-[#0a0d12] px-1.5 py-1 text-left font-mono text-[9.5px] leading-relaxed text-accent/90 transition-colors hover:border-accent/40"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  aria-hidden
                                  className="shrink-0 opacity-70"
                                >
                                  <rect x="4" y="1.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
                                  <rect x="1.5" y="4" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
                                </svg>
                                <span className="truncate">
                                  {copied === a.id ? "✓ commande copiée" : a.action}
                                </span>
                              </button>
                            ) : null}
                            {!read ? (
                              <button
                                onClick={() => acknowledge(a.id)}
                                className="mt-1.5 text-[9.5px] text-faint transition-colors hover:text-accent"
                              >
                                marquer comme lu
                              </button>
                            ) : (
                              <div className="mt-1.5 text-[9.5px] text-faint">
                                lu
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* footer: browser permission */}
            <div className="border-t border-line px-3.5 py-2.5">
              {perm === "granted" ? (
                <div className="flex items-center gap-1.5 text-[10px] text-good">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  alertes critiques poussées au navigateur
                </div>
              ) : perm === "denied" ? (
                <p className="text-[10px] leading-relaxed text-faint">
                  notifications navigateur refusées — réactivables dans les
                  réglages du site.
                </p>
              ) : perm === "unsupported" ? (
                <p className="text-[10px] leading-relaxed text-faint">
                  ce navigateur ne propose pas les notifications système ; les
                  toasts restent actifs.
                </p>
              ) : (
                <button
                  onClick={askPermission}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-line px-2 py-1.5 text-[10.5px] text-dim transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M18 8.5a6 6 0 1 0-12 0c0 4.2-1.6 5.8-2.4 6.6-.4.4-.1 1 .4 1h16c.5 0 .8-.6.4-1-.8-.8-2.4-2.4-2.4-6.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                  activer les alertes critiques au navigateur
                </button>
              )}
              <p className="mt-1.5 text-center text-[9px] text-faint">
                les acquittements sont conservés sur cet appareil
              </p>
            </div>
          </div>
        </>
      ) : null}

      <style>{`
        @keyframes bellRing {
          0%, 82%, 100% { transform: rotate(0deg); }
          86% { transform: rotate(9deg); }
          90% { transform: rotate(-7deg); }
          94% { transform: rotate(4deg); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-6px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(-5px) scale(.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
