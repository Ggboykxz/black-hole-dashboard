"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Live } from "@/lib/types";
import { MAX_SAMPLES, type MetricSample } from "@/lib/live-store";
import { useHydratedClock } from "@/lib/use-mounted";
import {
  COMPACT_KEYS,
  SPECS,
  SPEC_BY_KEY,
  fmtDelta,
  fmtValue,
  isNum,
  type SampleKey,
  type Spec,
} from "@/lib/metrics";

const WINDOW_MS = 10 * 60 * 1000;

function humanAge(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—";
  if (s < 1) return "< 1 s";
  if (s < 90) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(Math.round(s % 60)).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}

function sparkPath(values: number[], w = 100, h = 28): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = values.length === 1 ? w : (i / (values.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

interface CardProps {
  spec: Spec;
  samples: MetricSample[];
  now: number;
  windowMs: number;
}

/**
 * One tracked number.
 *
 * Three deltas, all computed from real samples:
 * * **dernier changement** — current minus the previous *distinct* value (so
 *   repeated polls of the same log line do not fake a `±0`);
 * * **Δ 1 min** — current minus the newest sample at least 60 s old;
 * * **min / max** — the actual range over the window, with the needle.
 *
 * Precision is per metric (`loss` at 5 decimals, LR in scientific notation):
 * "au millimètre" here means *as many digits as the producer actually wrote*,
 * never a padded zero that pretends to more precision than exists.
 */
function MetricCard({ spec, samples, now, windowMs }: CardProps) {
  const series = useMemo(
    () =>
      samples
        .filter((s) => now - s.t <= windowMs)
        .map((s) => ({ t: s.t, v: s[spec.key] }))
        .filter((p): p is { t: number; v: number } => isNum(p.v)),
    [samples, now, spec.key, windowMs],
  );

  const current = series.length ? series[series.length - 1].v : null;

  // previous *distinct* value, and how long the current one has held
  const change = useMemo(() => {
    if (!series.length) return { delta: null as number | null, sinceS: null as number | null, changed: false };
    const cur = series[series.length - 1];
    let i = series.length - 1;
    while (i > 0 && series[i - 1].v === cur.v) i--;
    const changed = i > 0;
    const sinceS = changed
      ? (now - series[i].t) / 1000
      : series.length > 1
        ? (now - series[0].t) / 1000
        : 0;
    return {
      delta: changed ? cur.v - series[i - 1].v : 0,
      sinceS,
      changed,
    };
  }, [series, now]);

  const delta1m = useMemo(() => {
    if (!series.length) return null;
    const cur = series[series.length - 1];
    let ref: { t: number; v: number } | null = null;
    for (const p of series) {
      if (now - p.t >= 60_000) ref = p;
    }
    if (!ref) return null;
    return cur.v - ref.v;
  }, [series, now]);

  const min = series.length ? Math.min(...series.map((p) => p.v)) : null;
  const max = series.length ? Math.max(...series.map((p) => p.v)) : null;
  const ratio =
    min !== null && max !== null && max > min && current !== null
      ? (current - min) / (max - min)
      : 0.5;

  const flash = useRef<number | null>(current);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (current !== null && flash.current !== current) {
      flash.current = current;
      setTick((t) => t + 1);
    }
  }, [current]);

  const deltaTone =
    change.delta === null || change.delta === 0 || spec.goodDir === null
      ? "text-faint"
      : (spec.goodDir === "up" ? change.delta > 0 : change.delta < 0)
        ? "text-good"
        : "text-bad";

  const valueTone =
    current === null
      ? "#64708a"
      : spec.warnAbove !== undefined && current >= spec.warnAbove
        ? "#fbbf24"
        : spec.warnBelow !== undefined && current <= spec.warnBelow
          ? "#fb7185"
          : spec.color;

  const spark = sparkPath(series.slice(-90).map((p) => p.v));
  const sparkVals = series.slice(-90);
  const lastSpark = sparkVals[sparkVals.length - 1];
  const sparkMin = sparkVals.length ? Math.min(...sparkVals.map((p) => p.v)) : 0;
  const sparkMax = sparkVals.length ? Math.max(...sparkVals.map((p) => p.v)) : 0;
  const lastY =
    lastSpark && sparkVals.length
      ? 26 - ((lastSpark.v - sparkMin) / (sparkMax - sparkMin || 1)) * 24
      : 14;

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-[#0a0d13]/70 p-2.5">
      {/* the metric's own colour, as a hairline: the grid becomes scannable */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${spec.color}, ${spec.color}00)`,
          opacity: 0.75,
        }}
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[9px] uppercase tracking-[0.08em] text-faint">
          {spec.label}
        </span>
        <span className="shrink-0 font-mono text-[8.5px] text-faint">
          {spec.unit}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          key={tick}
          className="num text-[16.5px] leading-none tabular-nums"
          style={{
            color: valueTone,
            animation: tick ? "valueTick 700ms ease-out" : undefined,
          }}
        >
          {fmtValue(spec, current)}
        </span>
        <span className={`num text-[10px] tabular-nums ${deltaTone}`}>
          {change.delta === null
            ? "—"
            : change.delta === 0
              ? "±0"
              : `${change.delta > 0 ? "▲" : "▼"} ${fmtDelta(spec, change.delta)}`}
        </span>
      </div>

      {/* the sparkline: the last 90 samples of this window */}
      <svg
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        className="mt-1.5 h-7 w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={`spark-${spec.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={spec.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={spec.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {spark ? (
          <>
            <path
              d={`${spark} L100 28 L0 28 Z`}
              fill={`url(#spark-${spec.key})`}
            />
            <path
              d={spark}
              fill="none"
              stroke={spec.color}
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx="100" cy={lastY} r="1.8" fill={spec.color} />
          </>
        ) : (
          <line x1="0" y1="14" x2="100" y2="14" stroke="#1e2430" strokeWidth="1" />
        )}
      </svg>

      {/* the ruler: min — current — max, at the width of the window */}
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#12161e]">
        <div
          className="absolute inset-y-0 left-0 right-0 rounded-full opacity-40"
          style={{
            background: `linear-gradient(90deg, ${spec.color}22, ${spec.color}55, ${spec.color}22)`,
          }}
        />
        <div
          className="absolute top-[-2px] h-[10px] w-[2px] rounded-full"
          style={{
            left: `calc(${(ratio * 100).toFixed(2)}% - 1px)`,
            background: spec.color,
            boxShadow: `0 0 6px ${spec.color}`,
            transition: "left 500ms ease-out",
          }}
        />
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-1 font-mono text-[8px] text-faint">
        <span className="truncate">min {fmtValue(spec, min)}</span>
        <span className="shrink-0 text-center">
          {change.delta === 0 && change.sinceS !== null
            ? `stable ${humanAge(change.sinceS)}`
            : change.sinceS !== null
              ? `il y a ${humanAge(change.sinceS)}`
              : ""}
        </span>
        <span className="truncate text-right">max {fmtValue(spec, max)}</span>
      </div>

      <div className="mt-0.5 flex items-baseline justify-between font-mono text-[8px]">
        <span className="text-faint">Δ 1 min</span>
        <span
          className={`tabular-nums ${
            delta1m === null || delta1m === 0 || spec.goodDir === null
              ? "text-faint"
              : (spec.goodDir === "up" ? delta1m > 0 : delta1m < 0)
                ? "text-good"
                : "text-bad"
          }`}
        >
          {delta1m === null ? "—" : fmtDelta(spec, delta1m)}
        </span>
      </div>
    </div>
  );
}

interface Props {
  live: Live | null;
  samples: MetricSample[];
  offline?: boolean;
  ageS?: number | null;
  /** six headline metrics instead of twelve */
  compact?: boolean;
  /** the poll-by-poll ledger (the "bande de contrôle") */
  ledger?: boolean;
  /** the payload is a frozen snapshot: there is no second measurement */
  staticOnly?: boolean;
  onReset?: () => void;
}

/**
 * The variation tracker.
 *
 * It shows what changed *since the last measurement*, not since the last
 * render. The distinction matters: the trainer writes `log.jsonl` every 10
 * steps (~26 s), so a 1 s poll usually re-reads the same line. The tracker
 * therefore reports the last **distinct** value and how long it has held,
 * instead of drawing a flat line as if the model had stopped.
 */
export default function LiveVariations({
  live,
  samples,
  offline = false,
  ageS = null,
  compact = false,
  ledger = false,
  staticOnly = false,
  onReset,
}: Props) {
  const now = useHydratedClock();


  const windowSamples = useMemo(
    () => samples.filter((s) => now - s.t <= WINDOW_MS),
    [samples, now],
  );

  const specs = compact
    ? SPECS.filter((s) => COMPACT_KEYS.includes(s.key))
    : SPECS;

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const spanS = (samples[samples.length - 1].t - samples[0].t) / 1000;
    const diffs: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      diffs.push((samples[i].t - samples[i - 1].t) / 1000);
    }
    diffs.sort((a, b) => a - b);
    const median = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
    const lastAge = (now - samples[samples.length - 1].t) / 1000;
    return { spanS, median, lastAge };
  }, [samples, now]);

  const recent = useMemo(() => {
    const rows = samples.slice(-26);
    return [...rows].reverse().map((s, idx) => {
      const i = samples.length - 1 - idx;
      const prev = i > 0 ? samples[i - 1] : null;
      return { s, prev };
    });
  }, [samples]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-medium tracking-tight text-ink">
            Traque des variations
          </h2>
          <p className="mt-0.5 max-w-3xl text-[10.5px] leading-relaxed text-dim">
            Chaque poll écrit un échantillon ; les deltas sont calculés sur les
            valeurs mesurées, jamais lissées ni interpolées. Précision = celle
            du producteur (perte à 5 décimales, LR en notation scientifique).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip !px-2 !py-[2px] !text-[9.5px]">
            {samples.length} échantillon{samples.length > 1 ? "s" : ""}
          </span>
          {stats ? (
            <>
              <span className="chip !px-2 !py-[2px] !text-[9.5px]">
                fenêtre {humanAge(stats.spanS)}
              </span>
              <span
                className="chip !px-2 !py-[2px] !text-[9.5px]"
                title="intervalle médian entre deux polls"
              >
                Δt ≈ {stats.median.toFixed(1)} s
              </span>
              <span
                className={`chip !px-2 !py-[2px] !text-[9.5px] ${
                  offline ? "!border-warn/40 !text-warn" : ""
                }`}
              >
                dernier reçu il y a {humanAge(stats.lastAge)}
              </span>
            </>
          ) : null}
          {onReset ? (
            <button
              onClick={onReset}
              className="chip !px-2 !py-[2px] !text-[9.5px] hover:!border-bad/40 hover:!text-bad"
              title="effacer le journal local des échantillons"
            >
              effacer
            </button>
          ) : null}
        </div>
      </div>

      {samples.length < 2 ? (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[10.5px] ${
            staticOnly
              ? "border-bad/40 bg-bad/[0.06] text-bad/90"
              : "border-line bg-[#0a0d13]/60 text-dim"
          }`}
        >
          <span
            className={`pulse ${staticOnly ? "pulse-static" : ""}`}
            style={staticOnly ? { background: "#fb7185" } : undefined}
          />
          {staticOnly ? (
            <span>
              <strong className="font-medium">Instantané figé.</strong> Cette
              source ne produit pas de nouvelle mesure : aucune variation ne
              peut être calculée tant que le direct n&apos;est pas rétabli.
            </span>
          ) : (
            <span>
              La traque démarre : il faut au moins deux polls pour calculer une
              variation. Le premier échantillon est déjà écrit.
            </span>
          )}
        </div>
      ) : null}

      <div
        className={`grid gap-2 ${
          compact
            ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
            : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        }`}
      >
        {specs.map((spec) => (
          <MetricCard
            key={spec.key}
            spec={spec}
            samples={windowSamples}
            now={now}
            windowMs={WINDOW_MS}
          />
        ))}
      </div>

      <p className="text-[9.5px] leading-relaxed text-faint">
        La perte n&apos;est écrite que toutes les 10 steps (~26 s) : un Δ nul
        entre deux polls est normal et signalé « stable ». Un Δ non nul est
        toujours un vrai changement du log. La fenêtre glisse sur 10 min et
        reste bornée à {MAX_SAMPLES.toLocaleString("fr-FR")} échantillons
        persistés.
      </p>

      {ledger && recent.length ? (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-[#0b0e14]/80 px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.08em] text-faint">
              bande de contrôle — {recent.length} derniers polls
            </span>
            <span className="font-mono text-[8.5px] text-faint">
              {live?.source ? `source ${live.source}` : "journal local"}
              {offline ? " · hors ligne" : ""}
              {ageS !== null ? ` · signal ${humanAge(ageS)}` : ""}
            </span>
          </div>
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse font-mono text-[9.5px] tabular-nums">
              <thead className="sticky top-0 z-[1] bg-[#0d1016]/95 text-[8.5px] uppercase tracking-[0.06em] text-faint backdrop-blur">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">heure</th>
                  <th className="px-2 py-1.5 text-right font-medium">Δt</th>
                  <th className="px-2 py-1.5 text-right font-medium">step</th>
                  <th className="px-2 py-1.5 text-right font-medium">perte</th>
                  <th className="px-2 py-1.5 text-right font-medium">Δ perte</th>
                  <th className="px-2 py-1.5 text-right font-medium">tok/s</th>
                  <th className="px-2 py-1.5 text-right font-medium">°C</th>
                  <th className="px-2 py-1.5 text-right font-medium">MHz</th>
                  <th className="px-2 py-1.5 text-right font-medium">VRAM</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(({ s, prev }, i) => {
                  const dLoss =
                    prev && s.train_loss !== null && prev.train_loss !== null
                      ? s.train_loss - prev.train_loss
                      : null;
                  const dt = prev ? (s.t - prev.t) / 1000 : null;
                  return (
                    <tr
                      key={`${s.t}-${i}`}
                      className="border-t border-line/60 text-dim transition-colors hover:bg-accent/[0.05]"
                    >
                      <td className="px-2 py-1 text-left text-accent/80">
                        {new Date(s.t).toLocaleTimeString("fr-FR", {
                          hour12: false,
                        })}
                      </td>
                      <td className="px-2 py-1 text-right text-faint">
                        {dt === null ? "—" : `${dt.toFixed(1)} s`}
                      </td>
                      <td className="px-2 py-1 text-right text-ink">
                        {s.step.toLocaleString("fr-FR")}
                      </td>
                      <td className="px-2 py-1 text-right text-ink">
                        {fmtValue(SPEC_BY_KEY.train_loss, s.train_loss)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${
                          dLoss === null || dLoss === 0
                            ? "text-faint"
                            : dLoss < 0
                              ? "text-good"
                              : "text-bad"
                        }`}
                      >
                        {dLoss === null ? "—" : fmtDelta(SPEC_BY_KEY.train_loss, dLoss)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {fmtValue(SPEC_BY_KEY.tokens_per_s, s.tokens_per_s)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${
                          s.temp_c !== null && s.temp_c >= 78
                            ? "text-warn"
                            : ""
                        }`}
                      >
                        {fmtValue(SPEC_BY_KEY.temp_c, s.temp_c)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {fmtValue(SPEC_BY_KEY.clock_mhz, s.clock_mhz)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {fmtValue(SPEC_BY_KEY.vram_used_gb, s.vram_used_gb)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes valueTick {
          0% { text-shadow: 0 0 14px currentColor; filter: brightness(1.55); }
          100% { text-shadow: none; filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}
