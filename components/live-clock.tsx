"use client";

import { clockUTC, ageAt, preciseAge } from "@/lib/signal";
import { useTicker } from "@/lib/use-ticker";

/**
 * The dashboard's live instrument.
 *
 * Everything here is derived from two facts: `Date.now()` and the payload's
 * own `updated_at`. The UTC clock shows milliseconds; the age of the signal
 * shows decimals; the round-trip and the network cadence say how the number
 * reached the browser. None of it waits for the next poll — the browser can
 * measure its own clock between two network reads.
 */
export function LiveClock({
  updatedAt,
  latencyMs,
  pollMs,
  compact = false,
}: {
  updatedAt?: string | null;
  latencyMs: number | null;
  pollMs: number;
  compact?: boolean;
}) {
  const now = useTicker(100);
  const age = now ? ageAt(updatedAt, now) : null;

  return (
    <span className="flex flex-col items-end gap-1 leading-none">
      <span className="num text-[11px] tabular-nums text-ink" title="horloge UTC, rafraîchie localement à ~10 Hz">
        {now ? clockUTC(now) : "--:--:--.---"}
        <span className="ml-1 text-[9px] font-normal tracking-wide text-faint">UTC</span>
      </span>
      <span
        className="num flex items-center gap-1.5 text-[9px] text-faint"
        title="âge du dernier point du producteur · cadence du réseau · dernier aller-retour mesuré"
      >
        <span style={{ color: "var(--pulse-color)" }}>
          {now ? preciseAge(age) : "—"}
        </span>
        <span className="text-line">·</span>
        <span>poll {pollMs / 1000} s</span>
        {!compact ? (
          <>
            <span className="text-line">·</span>
            <span>{latencyMs === null ? "—" : `${latencyMs} ms`}</span>
          </>
        ) : null}
      </span>
    </span>
  );
}

/** Just the producer's age, recomputed locally between two polls. */
export function SignalAge({
  updatedAt,
  className = "",
}: {
  updatedAt?: string | null;
  className?: string;
}) {
  const now = useTicker(100);
  return (
    <span className={className} title="âge de la dernière mesure écrite par le producteur">
      {now ? preciseAge(ageAt(updatedAt, now)) : "—"}
    </span>
  );
}
