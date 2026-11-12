import type { MetricSample } from "./live-store";

/**
 * The tracked metrics — one table, shared by the variation tracker, the
 * change feed and the notifications.
 *
 * "Millimetric" means *the producer's own precision*: a loss is shown with
 * the five decimals the log wrote, a learning rate in scientific notation,
 * a clock in MHz. Padding a value with zeros the producer never wrote would
 * be a lie told in the other direction.
 */

export type SampleKey = Exclude<keyof MetricSample, "t">;

export interface Spec {
  key: SampleKey;
  label: string;
  unit: string;
  color: string;
  digits: number;
  sci?: boolean;
  /** which direction is an improvement; null = neither (a thermometer) */
  goodDir: "up" | "down" | null;
  warnAbove?: number;
  warnBelow?: number;
  /** where the number comes from — shown in the change feed */
  origin: "run" | "gpu" | "disque";
}

export const SPECS: Spec[] = [
  { key: "step", label: "step", unit: "steps", color: "#e6eaf2", digits: 0, goodDir: "up", origin: "run" },
  { key: "train_loss", label: "perte train", unit: "nats", color: "#38bdf8", digits: 5, goodDir: "down", origin: "run" },
  { key: "val_loss", label: "éval du run", unit: "nats", color: "#a78bfa", digits: 5, goodDir: "down", origin: "run" },
  { key: "lr", label: "learning rate", unit: "", color: "#94a3b8", digits: 6, sci: true, goodDir: null, origin: "run" },
  { key: "grad_norm", label: "grad norm", unit: "", color: "#fbbf24", digits: 4, goodDir: "down", origin: "run" },
  { key: "tokens_per_s", label: "débit", unit: "tok/s", color: "#34d399", digits: 0, goodDir: "up", origin: "run" },
  { key: "pace_s_per_step", label: "cadence", unit: "s/step", color: "#38bdf8", digits: 3, goodDir: "down", origin: "run" },
  { key: "temp_c", label: "GPU temp", unit: "°C", color: "#f97316", digits: 1, goodDir: null, warnAbove: 78, origin: "gpu" },
  { key: "power_w", label: "GPU puissance", unit: "W", color: "#fbbf24", digits: 1, goodDir: null, origin: "gpu" },
  { key: "clock_mhz", label: "horloge SM", unit: "MHz", color: "#38bdf8", digits: 0, goodDir: "up", origin: "gpu" },
  { key: "util_gpu", label: "GPU utilisation", unit: "%", color: "#34d399", digits: 1, goodDir: null, origin: "gpu" },
  { key: "vram_used_gb", label: "VRAM", unit: "Go", color: "#a78bfa", digits: 2, goodDir: "down", origin: "gpu" },
  { key: "free_gb", label: "disque libre", unit: "Go", color: "#34d399", digits: 1, goodDir: "up", origin: "disque" },
];

export const COMPACT_KEYS: SampleKey[] = [
  "step",
  "train_loss",
  "lr",
  "tokens_per_s",
  "temp_c",
  "clock_mhz",
];

export const SPEC_BY_KEY: Record<SampleKey, Spec> = Object.fromEntries(
  SPECS.map((s) => [s.key, s]),
) as Record<SampleKey, Spec>;

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** The value, with the producer's precision and nothing more. */
export function fmtValue(spec: Spec, v: number | null): string {
  if (!isNum(v)) return "—";
  if (spec.sci) return v.toExponential(6);
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: spec.digits,
    maximumFractionDigits: spec.digits,
  });
}

/** The delta, with the same precision — never rounded to a nicer lie. */
export function fmtDelta(spec: Spec, v: number | null): string {
  if (!isNum(v)) return "—";
  if (v === 0) return "±0";
  const body = spec.sci
    ? Math.abs(v).toExponential(6)
    : Math.abs(v).toLocaleString("fr-FR", {
        minimumFractionDigits: spec.digits,
        maximumFractionDigits: spec.digits,
      });
  return `${v > 0 ? "+" : "−"}${body}`;
}
