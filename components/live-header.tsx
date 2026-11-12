"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLiveFeed } from "./live-provider";
import { LiveClock, SignalAge } from "./live-clock";
import type { Change } from "@/lib/changes";
import type { SampleKey } from "@/lib/metrics";
import { f4, hours, int, pct, step as fmtStep } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = {
  local: "log local",
  hub: "heartbeat Hub",
  snapshot: "instantané figé",
  cache: "journal local",
  none: "aucun signal",
};

/**
 * One measured field, with the last movement that was actually detected.
 *
 * The delta is shown only when the producer *wrote* a different value — the
 * feed never invents a variation out of two identical readings.
 */
function Field({
  label,
  value,
  change,
  digits = 4,
  hide = "",
}: {
  label: string;
  value: string;
  change?: Change;
  digits?: number;
  /** the classes that hide the field on the narrow screens */
  hide?: string;
}) {
  const tone =
    !change || change.trend === null
      ? "text-faint"
      : change.trend === "good"
        ? "text-good"
        : change.trend === "bad"
          ? "text-bad"
          : "text-faint";
  return (
    <span className={`flex shrink-0 flex-col leading-none ${hide}`}>
      <span className="text-[8.5px] uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <span className="num mt-1 flex items-baseline gap-1 text-[12.5px] text-ink">
        {value}
        {change ? (
          <span
            key={change.id}
            className={`text-[9px] ${tone}`}
            style={{ animation: "flashValue 1.4s ease-out" }}
            title={`${change.label} : ${change.from} → ${change.to}`}
          >
            {change.delta > 0 ? "+" : "−"}
            {Math.abs(change.delta).toLocaleString("fr-FR", {
              minimumFractionDigits: Math.min(digits, 5),
              maximumFractionDigits: Math.min(digits, 5),
            })}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-line/80" />;
}

/**
 * The site header — and it is *live*.
 *
 * It reads the shared feed (`LiveProvider`): the step, the loss, the learning
 * rate and the throughput are the producer's current values, the freshness
 * of the signal is written next to them, and every value that moved flashes
 * with its exact delta.
 *
 * The clock on the right is deliberately local: between two network polls it
 * keeps moving at ~10 Hz, and the age of the signal is recomputed from the
 * payload's own `updated_at`. The numbers stay honest — the UI is fast, the
 * measurements are not invented.
 */
export default function LiveHeader({
  bench,
  initial,
}: {
  bench: { loss: number; step: number } | null;
  /** the embedded snapshot, shown while the first poll is in flight */
  initial?: {
    step: number;
    max_steps: number;
    train_loss: number | null;
    lr: number | null;
    val_loss: number | null;
    tokens_per_s: number | null;
  } | null;
}) {
  const feed = useLiveFeed();
  const { live, meta, state, source, paused, setPaused } = feed;

  const latest = useMemo(() => {
    const m = new Map<SampleKey, Change>();
    for (const c of feed.changes) if (!m.has(c.key)) m.set(c.key, c);
    return m;
  }, [feed.changes]);

  const step = live?.step ?? initial?.step ?? 0;
  const maxSteps = live?.max_steps ?? initial?.max_steps ?? 0;
  const percent =
    live?.percent ?? (maxSteps ? (100 * step) / maxSteps : null);
  const train = live?.train_loss ?? initial?.train_loss ?? null;
  const lr = live?.lr ?? initial?.lr ?? null;
  const val = live?.val_loss ?? initial?.val_loss ?? null;
  const tok = live?.tokens_per_s ?? initial?.tokens_per_s ?? null;

  return (
    <div
      className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-[11.5px] md:px-6"
      data-bot-target="status"
      style={{ ["--pulse-color" as string]: meta.color }}
    >
      {/* the top hairline carries the state colour into the page */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, ${meta.color}aa, ${meta.color}22 45%, transparent 85%)`,
        }}
      />

      {/* the state of the signal — never a green dot over frozen numbers */}
      <span className="flex shrink-0 items-center gap-2" title={meta.hint}>
        <span className={`pulse ${state === "live" ? "" : "pulse-static"}`} />
        <span
          className="text-[10px] font-medium tracking-[0.12em]"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
        <span className="hidden rounded-full border border-line/80 bg-white/[0.025] px-2 py-[2px] text-[9px] text-faint xl:inline">
          {SOURCE_LABEL[source] ?? source}
        </span>
      </span>

      <Divider />

      {/* the run's headline, then the measured fields */}
      <div className="flex min-w-0 items-end gap-x-4 gap-y-2">
        <span className="flex shrink-0 flex-col leading-none">
          <span className="text-[8.5px] uppercase tracking-[0.16em] text-faint">
            step
          </span>
          <span className="num mt-1 flex items-baseline gap-1.5 text-[13px] text-ink">
            {fmtStep(step)}
            <span className="text-[10px] font-normal text-faint">
              / {fmtStep(maxSteps)}
            </span>
            {percent !== null ? (
              <span
                className="text-[9.5px] font-normal"
                style={{ color: meta.color }}
              >
                {pct(percent, 1)}
              </span>
            ) : null}
          </span>
        </span>

        <Field
          label="train"
          value={f4(train)}
          change={latest.get("train_loss")}
          digits={5}
        />
        <Field
          label="lr"
          value={lr ? lr.toExponential(2) : "—"}
          change={latest.get("lr")}
          digits={6}
          hide="hidden md:flex"
        />
        <Field
          label="val"
          value={val !== null && val !== undefined ? f4(val) : "—"}
          change={latest.get("val_loss")}
          digits={5}
          hide="hidden xl:flex"
        />
        <Field
          label="débit"
          value={int(tok)}
          change={latest.get("tokens_per_s")}
          digits={0}
          hide="hidden lg:flex"
        />
        <span className="num hidden text-[9px] text-faint lg:inline">tok/s</span>

        {bench ? (
          <span
            className="hidden shrink-0 flex-col leading-none 2xl:flex"
            title="série officielle — protocole fixe, mise à jour par le keepalive"
          >
            <span className="text-[8.5px] uppercase tracking-[0.16em] text-faint">
              bench
            </span>
            <span className="num mt-1 text-[12px] text-accent">
              {bench.loss.toFixed(5)}
              <span className="ml-1 text-[9px] text-faint">
                @{fmtStep(bench.step)}
              </span>
            </span>
          </span>
        ) : null}
      </div>

      {/* the local instrument: clock, age, cadence, latency */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {feed.changeCount ? (
          <span
            className="hidden rounded-full border border-line/80 bg-white/[0.025] px-2 py-[2px] text-[9px] text-dim lg:inline"
            title="valeurs modifiées détectées depuis l'ouverture de la page"
          >
            {feed.changeCount} changement{feed.changeCount > 1 ? "s" : ""}
          </span>
        ) : null}

        <span className="hidden sm:block">
          <LiveClock
            updatedAt={live?.updated_at}
            latencyMs={feed.latencyMs}
            pollMs={feed.pollMs}
            compact={false}
          />
        </span>
        <span className="block sm:hidden">
          <LiveClock
            updatedAt={live?.updated_at}
            latencyMs={feed.latencyMs}
            pollMs={feed.pollMs}
            compact
          />
        </span>

        <Link
          href="/live"
          className="hidden text-[10px] text-accent/90 underline-offset-2 transition-colors hover:text-accent hover:underline md:inline"
        >
          direct →
        </Link>

        {/* pause is a real command: it stops the feed and AutoRefresh */}
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.1em] transition-colors ${
            paused
              ? "border-warn/45 bg-warn/10 text-warn hover:bg-warn/15"
              : "border-good/35 bg-good/[0.06] text-good hover:bg-good/10"
          }`}
          title={
            paused
              ? "Le direct est en pause — cliquez pour le reprendre"
              : "Mettre le direct en pause (arrête le polling)"
          }
          aria-pressed={paused}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              paused ? "bg-warn" : "bg-good"
            }`}
          />
          <span className="hidden sm:inline">{paused ? "reprendre" : "pause"}</span>
          <span className="sm:hidden">{paused ? "▶" : "❚❚"}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * The rail's footer block — the same live numbers, in the sidebar.
 */
export function RailStatus() {
  const feed = useLiveFeed();
  const { live, meta } = feed;
  const step = live?.step ?? 0;
  const percent = live?.percent ?? (live?.max_steps ? (100 * step) / live.max_steps : 0);

  return (
    <div className="space-y-2" style={{ ["--pulse-color" as string]: meta.color }}>
      <div>
        <div className="num flex items-baseline justify-between text-[11px] text-dim">
          <span>
            step <span className="text-ink">{fmtStep(step)}</span>
          </span>
          <span className="text-faint">/ {fmtStep(live?.max_steps ?? 0)}</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#12161e]">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${percent ?? 0}%`, background: meta.color }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9.5px]">
          <span className="num" style={{ color: meta.color }}>
            {pct(percent, 1)}
          </span>
          <span className="num text-faint">{hours(live?.eta_h)}</span>
        </div>
      </div>
      <div className="num">
        train <span className="text-ink">{f4(live?.train_loss)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[9.5px]">
        <span className={`pulse ${feed.state === "live" ? "" : "pulse-static"}`} />
        <span style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-faint">
          · <SignalAge updatedAt={live?.updated_at} />
        </span>
      </div>
      <div className="num flex justify-between border-t border-line/70 pt-1.5 text-[9px] text-faint">
        <span>poll {feed.pollMs / 1000} s</span>
        <span>{feed.latencyMs === null ? "— ms" : `${feed.latencyMs} ms`}</span>
      </div>
    </div>
  );
}
