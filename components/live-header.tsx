"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLiveFeed } from "./live-provider";
import type { Change } from "@/lib/changes";
import type { SampleKey } from "@/lib/metrics";
import { f2, f4, hours, int, pct, step as fmtStep } from "@/lib/format";
import { humanAge } from "@/lib/signal";

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
    <span className={`num flex items-baseline gap-1 text-dim ${hide}`}>
      {label}{" "}
      <span className="text-ink">{value}</span>
      {change ? (
        <span
          key={change.id}
          className={`text-[9.5px] ${tone}`}
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
  );
}

/**
 * The site header — and it is *live*.
 *
 * It used to be rendered on the server from the embedded snapshot: the
 * numbers were frozen and the green "live" dot was a lie. Now the header
 * reads the shared feed (`LiveProvider`), so the step, the loss, the
 * learning rate and the throughput are the producer's current values, the
 * freshness of the signal is written next to them, and every value that
 * moved flashes with its exact delta.
 */
export default function LiveHeader({
  bench,
}: {
  bench: { loss: number; step: number } | null;
}) {
  const feed = useLiveFeed();
  const { live, meta, state, age, source } = feed;

  const latest = useMemo(() => {
    const m = new Map<SampleKey, Change>();
    for (const c of feed.changes) if (!m.has(c.key)) m.set(c.key, c);
    return m;
  }, [feed.changes]);

  const step = live?.step ?? 0;
  const percent = live?.percent ?? (live?.max_steps ? (100 * step) / live.max_steps : null);

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-[11.5px] md:px-7"
      data-bot-target="status"
      style={{ ["--pulse-color" as string]: meta.color }}
    >
      {/* the state of the signal — never a green dot over frozen numbers */}
      <span
        className="flex items-center gap-1.5"
        title={meta.hint}
      >
        <span className={`pulse ${state === "live" ? "" : "pulse-static"}`} />
        <span className="text-[10.5px] font-medium tracking-wide" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </span>

      <span className="num text-dim" title="la source qui a répondu">
        <span className="text-faint">{SOURCE_LABEL[source] ?? source}</span>
      </span>

      <Field
        label="step"
        value={fmtStep(step)}
        change={latest.get("step")}
        digits={0}
      />
      <span className="num text-dim">
        / {fmtStep(live?.max_steps ?? 0)}
        {percent !== null ? (
          <span className="text-faint"> · {pct(percent, 1)}</span>
        ) : null}
      </span>

      <Field
        label="train"
        value={f4(live?.train_loss)}
        change={latest.get("train_loss")}
        digits={5}
      />
      <Field
        label="lr"
        value={live?.lr ? live.lr.toExponential(2) : "—"}
        change={latest.get("lr")}
        digits={6}
      />
      <Field
        label="val"
        value={live?.val_loss !== null && live?.val_loss !== undefined ? f4(live.val_loss) : "—"}
        change={latest.get("val_loss")}
        digits={5}
        hide="hidden lg:inline-flex"
      />
      {bench ? (
        <span
          className="num hidden text-dim lg:inline-flex"
          title="série officielle — protocole fixe, mise à jour par le keepalive"
        >
          bench{" "}
          <span className="text-accent">{bench.loss.toFixed(5)}</span>
          <span className="text-faint"> @{fmtStep(bench.step)}</span>
        </span>
      ) : null}
      <Field
        label=""
        value={int(live?.tokens_per_s)}
        change={latest.get("tokens_per_s")}
        digits={0}
        hide="hidden sm:inline-flex"
      />
      <span className="num hidden text-faint sm:inline">tok/s</span>

      {/* the freshness, and the count of everything that moved */}
      <span className="num ml-auto flex items-center gap-2 text-faint">
        {feed.changeCount ? (
          <span
            className="rounded-full border border-line px-1.5 py-[1px] text-[9.5px] text-dim"
            title="valeurs modifiées détectées depuis l'ouverture de la page"
          >
            {feed.changeCount} changement{feed.changeCount > 1 ? "s" : ""}
          </span>
        ) : null}
        <span title="âge du signal, recalculé chaque seconde depuis updated_at">
          signal {humanAge(age)}
        </span>
        <Link href="/live" className="text-accent/90 underline-offset-2 hover:underline">
          direct →
        </Link>
      </span>
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
        <div className="num text-[11px] text-dim">
          step {fmtStep(step)} / {fmtStep(live?.max_steps ?? 0)}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#12161e]">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${percent ?? 0}%`, background: meta.color }}
          />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="num">{pct(percent, 1)}</span>
          <span className="num">{hours(live?.eta_h)}</span>
        </div>
      </div>
      <div className="num">
        train <span className="text-ink">{f4(live?.train_loss)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`pulse ${feed.state === "live" ? "" : "pulse-static"}`} />
        <span style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-faint">· {humanAge(feed.age)}</span>
      </div>
    </div>
  );
}
