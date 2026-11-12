import type { MetricSample } from "./live-store";
import { SPECS, isNum, type SampleKey } from "./metrics";

/**
 * The change feed — every value that moved, with its exact before/after.
 *
 * The variation tracker answers "what is the value now, and how far did it
 * move since the last *distinct* measurement?". The change feed answers the
 * complementary question: "what actually changed, and by how much?" — one
 * line per modified metric, at the producer's precision.
 *
 * Nothing is interpolated here either: a change exists only when two
 * consecutive measurements differ. If the producer repeats the same value,
 * no line is written — a repeated value is not a change.
 */

export interface Change {
  /** a stable identity: metric + the measurement it came from */
  id: string;
  /** local detection time */
  t: number;
  key: SampleKey;
  label: string;
  unit: string;
  color: string;
  from: number | null;
  to: number;
  delta: number;
  digits: number;
  sci: boolean;
  origin: "run" | "gpu" | "disque";
  /** did it move the good way? null when the metric has no direction */
  trend: "good" | "bad" | "flat" | null;
  level: "info" | "warn";
  /** the threshold it crossed, if any */
  crossed: "above" | "below" | null;
}

function trendOf(
  key: SampleKey,
  delta: number,
): "good" | "bad" | "flat" | null {
  const spec = SPECS.find((s) => s.key === key);
  if (!spec || spec.goodDir === null) return null;
  if (delta === 0) return "flat";
  const up = delta > 0;
  return (spec.goodDir === "up") === up ? "good" : "bad";
}

/**
 * The differences between two distinct measurements.
 *
 * `prev` is the previous *sample* (not the previous poll): the caller only
 * stores a sample when the producer actually wrote something new, so this
 * diff never reports a change that did not happen.
 */
export function diffSamples(
  prev: MetricSample | null,
  next: MetricSample,
  stamp: string,
): Change[] {
  const out: Change[] = [];
  for (const spec of SPECS) {
    const to = next[spec.key];
    if (!isNum(to)) continue;
    if (!prev) {
      // the very first measurement: the value is known, the movement is not
      continue;
    }
    const from = prev[spec.key];
    if (!isNum(from) || from === to) continue;
    const delta = to - from;
    const trend = trendOf(spec.key, delta);
    let crossed: "above" | "below" | null = null;
    if (spec.warnAbove !== undefined && from < spec.warnAbove && to >= spec.warnAbove) {
      crossed = "above";
    } else if (
      spec.warnBelow !== undefined &&
      from > spec.warnBelow &&
      to <= spec.warnBelow
    ) {
      crossed = "below";
    }
    out.push({
      id: `${stamp}|${spec.key}|${from}→${to}`,
      t: next.t,
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      color: spec.color,
      from,
      to,
      delta,
      digits: spec.digits,
      sci: Boolean(spec.sci),
      origin: spec.origin,
      trend,
      level: crossed ? "warn" : "info",
      crossed,
    });
  }
  return out;
}

/** One human sentence per change — the value, the delta, the direction. */
export function describeChange(c: Change): string {
  const fmt = (v: number) =>
    c.sci
      ? v.toExponential(6)
      : v.toLocaleString("fr-FR", {
          minimumFractionDigits: c.digits,
          maximumFractionDigits: c.digits,
        });
  const arrow = c.delta > 0 ? "↑" : "↓";
  const unit = c.unit ? ` ${c.unit}` : "";
  return `${c.label} : ${fmt(c.from ?? 0)} → ${fmt(c.to)}${unit} (${fmt(
    Math.abs(c.delta),
  )}${arrow})`;
}
