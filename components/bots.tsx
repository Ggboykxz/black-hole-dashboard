"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildBots } from "@/lib/bots";
import { useLiveFeed } from "./live-provider";
import { useHydratedClock } from "@/lib/use-mounted";
import {
  observeBotStates,
  readBotHistory,
  readBotUi,
  stateSince,
  transitionsOf,
  writeBotUi,
  type BotHistory,
} from "@/lib/bots-history";
import Ball, { EMBLEM } from "./ball";

export interface Bot {
  id: string;
  name: string;
  role: string;
  state: "working" | "idle" | "waiting" | "alert";
  progress: number | null;
  color: string;
  headline: string;
  detail: string;
  source: string;
}

const STATE_LABEL: Record<Bot["state"], string> = {
  working: "en action",
  idle: "en veille",
  waiting: "en attente",
  alert: "vigilance",
};

const STATE_COLOR: Record<Bot["state"], string> = {
  working: "#34d399",
  idle: "#64708a",
  waiting: "#fbbf24",
  alert: "#fb7185",
};

const FILTERS: { key: Bot["state"] | "all"; label: string }[] = [
  { key: "all", label: "tous" },
  { key: "working", label: "en action" },
  { key: "idle", label: "en veille" },
  { key: "waiting", label: "en attente" },
  { key: "alert", label: "vigilance" },
];

/** The name of a bot, from the list (used by the history's toasts). */
function labelOf(bots: Bot[], id: string): string {
  return bots.find((b) => b.id === id)?.name ?? id;
}

/** "12 s", "3 min" — the age of the current state, measured. */
function ago(ts: number | null, now: number): string | null {
  if (ts === null) return null;
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 90) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}

interface Props {
  snapshot: Snapshot;
}

/**
 * The crew: one animated ball per actor of the system.
 *
 * The balls *live*: they drift on their own paths (each with its own period
 * and phase, so they never move in sync), they follow the cursor with their
 * eyes, they glow when they are working, and their rings are bound to real
 * measurements. A toast announces each new event — a benchmark measured, a
 * checkpoint written — so the board itself tells the story of the run.
 *
 * The board now reads the **shared** live feed: the crew's state is the
 * producer's state, refreshed with the rest of the dashboard, and the
 * filters are computed from it — never from a timer.
 */
export default function Bots({ snapshot }: Props) {
  const { live } = useLiveFeed();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bot["state"] | "all">("all");
  const [history, setHistory] = useState<BotHistory>(() => ({
    v: 1,
    state: {},
    transitions: [],
  }));
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const now = useHydratedClock();
  const area = useRef<HTMLDivElement | null>(null);
  const lastBench = useRef<number | null>(null);
  const lastStep = useRef<number>(0);

  // ---- persistence: the selection, the filter and the history survive ----
  useEffect(() => {
    setHistory(readBotHistory());
    const ui = readBotUi();
    setSelected(ui.selected);
    if (ui.filter) setFilter(ui.filter as Bot["state"] | "all");
  }, []);

  useEffect(() => {
    writeBotUi({ selected, filter });
  }, [selected, filter]);


  // --- events → toasts ----------------------------------------------------
  useEffect(() => {
    const bench = live?.benchmarks ?? [];
    const newest = bench.length ? bench[bench.length - 1] : null;
    if (newest && lastBench.current !== null && newest.step !== lastBench.current) {
      const d = newest.delta;
      setToasts((t) => [
        ...t,
        {
          id: Date.now(),
          text: `nouvelle mesure officielle : ${newest.loss.toFixed(5)} @ ${newest.step}${
            d !== undefined && d !== null ? ` (${d >= 0 ? "+" : ""}${d.toFixed(5)})` : ""
          }`,
        },
      ]);
    }
    if (newest) lastBench.current = newest.step;
    if (live?.step && live.step - lastStep.current >= 500) {
      lastStep.current = live.step;
      setToasts((t) => [
        ...t,
        { id: Date.now(), text: `checkpoint ${live.checkpoint ?? ""} écrit` },
      ]);
    }
  }, [live]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setTimeout(() => setToasts((x) => x.slice(1)), 5200);
    return () => window.clearTimeout(t);
  }, [toasts]);

  // --- parallax + eye tracking -------------------------------------------
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = area.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCursor({
        x: (e.clientX - r.left) / r.width - 0.5,
        y: (e.clientY - r.top) / r.height - 0.5,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const bots = useMemo(() => buildBots(snapshot, live), [snapshot, live]);

  /* The bots whose state comes from the *process list* cannot be judged
     before the first live payload: "the trainer is missing" and "we have
     not asked yet" are not the same statement. The banner says so. */
  const unknownProcesses = !live;

  // ---- the history: every *observed* state change is recorded -----------
  useEffect(() => {
    if (!bots.length) return;
    const { history: next, fresh } = observeBotStates(bots, history);
    setHistory(next);
    // a transition is news: it gets a toast, like a real event
    if (fresh.length) {
      setToasts((t) => [
        ...t,
        ...fresh.map((f) => ({
          id: Date.now() + f.at,
          text: `${labelOf(bots, f.bot)} : ${STATE_LABEL[f.from ?? "idle"]} → ${
            STATE_LABEL[f.to]
          }`,
        })),
      ]);
    }
  }, [bots]);

  const counts = useMemo(() => {
    const c: Record<Bot["state"], number> = {
      working: 0,
      idle: 0,
      waiting: 0,
      alert: 0,
    };
    for (const b of bots) c[b.state] += 1;
    return c;
  }, [bots]);

  const visible = useMemo(
    () => (filter === "all" ? bots : bots.filter((b) => b.state === filter)),
    [bots, filter],
  );

  const active = bots.find((b) => b.id === selected) ?? null;

  return (
    <div className="relative">
      {/* the events */}
      <div className="pointer-events-none absolute -top-2 right-0 z-20 flex flex-col items-end gap-1.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-full border border-accent/40 bg-panel2/95 px-3 py-1.5 text-[11px] text-accent shadow-lg backdrop-blur"
            style={{ animation: "breathe 260ms ease-out" }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* the crew's census — what is doing what, at a glance */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? bots.length : counts[f.key];
          const on = filter === f.key;
          const color = f.key === "all" ? "#38bdf8" : STATE_COLOR[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`chip !px-2 !py-[2px] !text-[9.5px] ${
                on ? "!text-ink" : "opacity-70 hover:opacity-100"
              }`}
              style={
                on
                  ? { borderColor: `${color}66`, background: `${color}18` }
                  : undefined
              }
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {f.label}
              <span className="num text-faint">{n}</span>
            </button>
          );
        })}
      </div>

      {unknownProcesses ? (
        <p className="mb-3 rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2 text-[11px] leading-relaxed text-accent/90">
          <strong className="font-medium">En attente du premier signal live.</strong>{" "}
          L&apos;état des processus — le trainer, le gardien, le veilleur —
          n&apos;est pas encore connu : l&apos;absence d&apos;une mesure n&apos;est
          pas une preuve d&apos;absence. Les valeurs affichées viennent de
          l&apos;instantané embarqué et seront remplacées dans quelques
          secondes.
        </p>
      ) : null}

      {/* what the circles around a bot mean — a ring nobody can read is a
          ring nobody should trust */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line/60 bg-[#0a0d13]/50 px-3 py-2 text-[10px] text-faint">
        <span className="uppercase tracking-[0.09em] text-faint/80">
          les cercles
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#34d399" strokeWidth="1.6" opacity="0.8" />
            <circle cx="8" cy="8" r="6" fill="none" stroke="#34d399" strokeWidth="1.6" strokeDasharray="1.4 2.6" opacity="0.5" />
          </svg>
          <span>
            <strong className="font-medium text-dim">l&apos;anneau</strong> = l&apos;état
            (vert en action, ambre en attente, rouge en vigilance, pointillé =
            en veille) ; le halo autour est sa lumière
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#38bdf8" strokeWidth="1.6" opacity="0.18" />
            <circle cx="8" cy="8" r="6" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="26 38" transform="rotate(-90 8 8)" />
          </svg>
          <span>
            <strong className="font-medium text-dim">l&apos;arc</strong> = la mesure
            du bot (avancement du run pour l&apos;entraîneur, contrôles OK pour
            l&apos;auditeur, points mesurés pour le mesureur)
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
            <rect x="3.5" y="4.5" width="9" height="7" rx="2" fill="#1b2230" stroke="#a78bfa" strokeWidth="1.1" />
            <circle cx="6.4" cy="8" r="1" fill="#a78bfa" />
            <circle cx="9.6" cy="8" r="1" fill="#a78bfa" />
          </svg>
          <span>
            <strong className="font-medium text-dim">l&apos;écran</strong> et
            l&apos;emblème sur le torse = l&apos;acteur et sa mesure à lui
          </span>
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <span className="pulse pulse-static" style={{ background: "#64708a" }} />
          <p className="max-w-[320px] text-[11.5px] leading-relaxed text-dim">
            Aucun acteur dans cet état. C&apos;est une mesure, pas un bug :
            l&apos;équipe est reconstruite à partir des processus, du journal et
            des artefacts.
          </p>
          <button onClick={() => setFilter("all")} className="chip hover:text-ink">
            voir toute l&apos;équipe
          </button>
        </div>
      ) : (
        <div
          ref={area}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
          style={{
            transform: `perspective(900px) rotateX(${(-cursor.y * 3).toFixed(2)}deg) rotateY(${(
              cursor.x * 4
            ).toFixed(2)}deg)`,
            transition: "transform 400ms cubic-bezier(.22,.61,.36,1)",
          }}
        >
          {visible.map((b, idx) => {
            const sel = b.id === selected;
            const since = ago(stateSince(history, b.id, b.state), now);
            // each ball gets its own wandering path, phase and period
            const seed = (idx + 1) * 37;
            const drift = {
              "--dx1": `${(seed % 11) - 5}px`,
              "--dy1": `${((seed * 3) % 9) - 4}px`,
              "--dx2": `${((seed * 5) % 13) - 6}px`,
              "--dy2": `${((seed * 7) % 11) - 5}px`,
              animationDuration: `${13 + (seed % 11)}s`,
              animationDelay: `-${(seed % 9)}s`,
            } as React.CSSProperties;

            return (
              <button
                key={b.id}
                onClick={() => setSelected(sel ? null : b.id)}
                className={`card group relative overflow-hidden p-3 text-center transition-all duration-200 ${
                  sel ? "border-accent/60" : "hover:-translate-y-0.5"
                }`}
              >
                {/* the creature, centred: the card is a portrait */}
                <div className="flex justify-center">
                  <Ball
                    bot={b}
                    size={62}
                    eye={{ x: cursor.x * 6, y: cursor.y * 4 }}
                    selected={sel}
                  />
                </div>

                <div className="mt-1.5">
                  <div className="flex items-center justify-center gap-1.5">
                    {/* the emblem the avatar wears: it names the actor */}
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded border text-[9px]"
                      style={{
                        color: b.color,
                        borderColor: `${b.color}44`,
                        background: `${b.color}12`,
                      }}
                      title={b.role}
                    >
                      {EMBLEM[b.id] ?? "•"}
                    </span>
                    <span className="text-[12.5px] font-medium text-ink">
                      {b.name}
                    </span>
                    {b.state === "working" ? (
                      <span
                        className="pulse"
                        style={{ ["--pulse-color" as string]: b.color }}
                      />
                    ) : null}
                  </div>
                  <div className="truncate text-[10.5px] text-faint">{b.role}</div>
                </div>

                <div className="mt-2 line-clamp-2 min-h-[28px] text-[11px] leading-snug text-dim">
                  {b.headline}
                </div>

                {/* the bot's own measurement, as a bar */}
                {b.progress !== null ? (
                  <div className="mt-2.5">
                    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{
                          width: `${Math.round(
                            Math.max(0, Math.min(1, b.progress)) * 100,
                          )}%`,
                          background: `linear-gradient(90deg, ${b.color}, ${STATE_COLOR[b.state]})`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px]">
                  <span
                    className="rounded-full border px-1.5 py-[1px]"
                    style={{
                      color: STATE_COLOR[b.state],
                      borderColor: `${STATE_COLOR[b.state]}55`,
                      background: `${STATE_COLOR[b.state]}12`,
                    }}
                  >
                    {STATE_LABEL[b.state]}
                  </span>
                  <span className="num truncate text-faint">
                    {since ? `depuis ${since}` : b.source.split("/").pop()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {active ? (
        <div className="card mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Ball bot={active} size={72} />
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded border text-[9px]"
                    style={{
                      color: active.color,
                      borderColor: `${active.color}44`,
                      background: `${active.color}12`,
                    }}
                  >
                    {EMBLEM[active.id] ?? "•"}
                  </span>
                  <span className="text-[13px] text-ink">{active.name}</span>
                </div>
                <div className="text-[10.5px] text-faint">{active.role}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="chip hover:text-ink">
              fermer ✕
            </button>
          </div>
          {active.progress !== null ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[10.5px]">
                <span className="text-dim">avancement mesuré</span>
                <span className="num text-ink">
                  {(active.progress * 100).toFixed(1)} %
                </span>
              </div>
              <div className="mt-1 h-[4px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(Math.max(0, Math.min(1, active.progress)) * 100)}%`,
                    background: active.color,
                  }}
                />
              </div>
            </div>
          ) : null}
          <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-dim">
            {active.detail}
          </p>
          <p className="mt-2 font-mono text-[10px] text-faint">
            source : {active.source}
          </p>

          {/* the history: the transitions this board has observed */}
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="text-[9.5px] uppercase tracking-[0.09em] text-faint">
              historique observé
            </div>
            {transitionsOf(history, active.id).length === 0 ? (
              <p className="mt-1 text-[10.5px] text-faint">
                Aucun changement d&apos;état observé depuis l&apos;ouverture de
                ce tableau. L&apos;historique est conservé sur cet appareil.
              </p>
            ) : (
              <ol className="mt-1.5 space-y-1">
                {transitionsOf(history, active.id)
                  .slice(0, 8)
                  .map((t, i) => (
                    <li
                      key={`${t.at}-${i}`}
                      className="flex items-baseline gap-2 text-[10.5px]"
                    >
                      <span className="num shrink-0 font-mono text-[9px] text-faint">
                        {new Date(t.at).toLocaleTimeString("fr-FR")}
                      </span>
                      <span className="text-dim">
                        {STATE_LABEL[t.from ?? "idle"]} →{" "}
                        <span style={{ color: STATE_COLOR[t.to] }}>
                          {STATE_LABEL[t.to]}
                        </span>
                      </span>
                      <span className="num ml-auto shrink-0 text-faint">
                        {ago(t.at, now)}
                      </span>
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-center text-[11px] text-faint">
          Clique un bot pour le détail — chaque boule porte ses vraies
          métriques, et bouge parce que son artefact bouge.
        </p>
      )}

      <style>{`
        @keyframes blink { 0%,92%,100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
        @keyframes wander {
          0%   { transform: translate(0,0) rotate(0deg); }
          25%  { transform: translate(var(--dx1), var(--dy1)) rotate(4deg); }
          50%  { transform: translate(var(--dx2), var(--dy2)) rotate(-3deg); }
          75%  { transform: translate(calc(var(--dx1) * -0.6), calc(var(--dy2) * 0.7)) rotate(2deg); }
          100% { transform: translate(0,0) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
