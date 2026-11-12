"use client";

import type { Live } from "./types";

/**
 * The live feed, persisted.
 *
 * A dashboard that forgets everything on reload is a dashboard you have to
 * watch, not one you can leave open. The live panel therefore keeps its own
 * client-side journal: the last heartbeat, the points already plotted and the
 * GPU history are written to `localStorage` on every successful poll, and
 * restored before the first request completes.
 *
 * Two rules keep that honest:
 *
 * 1. **The age is never reset by the cache.** It is recomputed from the
 *    payload's own `updated_at`, so a restored page says "signal vieux de
 *    12 min" — it never pretends to be live.
 * 2. **The cache is a journal, not a second producer.** It only stores what
 *    `/api/live` returned; nothing is recalculated here.
 */

export const LIVE_KEY = "bh.live.v1";
export const SEEN_KEY = "bh.alerts.seen.v1";
export const HINT_KEY = "bh.swarm.hint.v1";

/** Enough for ~3 h of one-line-per-10-steps at the current pace. */
export const MAX_ROWS = 1200;
export const MAX_VALS = 400;
export const MAX_HISTORY = 360;
/** ~36 min of samples at the 3 s poll — enough to see a real drift. */
export const MAX_SAMPLES = 720;

export interface LiveRow {
  step: number;
  loss: number;
}

/**
 * One poll, kept as a *measurement* — never interpolated.
 *
 * The values come straight from `/api/live` (the log tail + `nvidia-smi`).
 * Storing the timestamp matters as much as the value: the variation tracker
 * can then say "stable depuis 26 s" instead of pretending that two identical
 * polls are two measurements.
 */
export interface MetricSample {
  /** local receipt clock, ms since epoch */
  t: number;
  step: number;
  train_loss: number | null;
  lr: number | null;
  grad_norm: number | null;
  tokens_per_s: number | null;
  pace_s_per_step: number | null;
  val_loss: number | null;
  temp_c: number | null;
  power_w: number | null;
  clock_mhz: number | null;
  util_gpu: number | null;
  vram_used_gb: number | null;
  free_gb: number | null;
}

export interface StoredLive {
  v: 1;
  /** local clock when the payload was received */
  savedAt: number;
  payload: Live;
  rows: LiveRow[];
  vals: LiveRow[];
  history: { t: number; temp_c: number; clock_mhz: number }[];
  /** the poll-by-poll journal used by the variation tracker */
  samples?: MetricSample[];
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // private mode / disabled storage — the page still works, it just forgets
    return null;
  }
}

export function readLive(): StoredLive | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(LIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLive;
    if (parsed?.v !== 1 || !parsed.payload || !Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLive(data: StoredLive): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(LIVE_KEY, JSON.stringify(data));
  } catch {
    // quota or serialisation problem: drop the oldest half and retry once
    try {
      s.setItem(
        LIVE_KEY,
        JSON.stringify({
          ...data,
          rows: data.rows.slice(-MAX_ROWS / 2),
          vals: data.vals.slice(-MAX_VALS / 2),
          samples: (data.samples ?? []).slice(-MAX_SAMPLES / 2),
        }),
      );
    } catch {
      /* the journal is a convenience, never a requirement */
    }
  }
}

export function clearLive(): void {
  try {
    storage()?.removeItem(LIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function readSeenAlerts(): Record<string, number> {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSeenAlerts(seen: Record<string, number>): void {
  try {
    storage()?.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
}

export function readHintDismissed(): boolean {
  try {
    return storage()?.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeHintDismissed(): void {
  try {
    storage()?.setItem(HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Seconds since an ISO timestamp, or null when it cannot be parsed.
 *
 * Fractional on purpose: the feed ticks its shared age once a second, but the
 * header computes its own age from the same `updated_at` at ~10 Hz and needs
 * the real value, not an already-rounded one. Display helpers round, never
 * this function — the state thresholds must see the actual age.
 */
export function ageOf(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 1000);
}

/** Dedupe by step, keep the newest value, sort ascending, cap the tail. */
export function mergeRows(
  old: LiveRow[],
  fresh: LiveRow[],
  max = MAX_ROWS,
): LiveRow[] {
  const map = new Map<number, number>();
  for (const p of old) map.set(p.step, p.loss);
  for (const p of fresh) map.set(p.step, p.loss);
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-max)
    .map(([step, loss]) => ({ step, loss }));
}

export function mergeVals(old: LiveRow[], fresh: LiveRow[]): LiveRow[] {
  return mergeRows(old, fresh, MAX_VALS);
}

/**
 * Freeze one live payload into a sample.
 *
 * The fallbacks are deliberate: `/api/live` in local mode puts the last log
 * row's values on the top-level fields, but a heartbeat might only carry the
 * row. We take the top-level value first, then the last row — never a value
 * recomputed from several sources.
 */
export function sampleFrom(live: Live, t = Date.now()): MetricSample {
  const last = live.rows?.[live.rows.length - 1];
  const g = live.gpu;
  return {
    t,
    step: live.step,
    train_loss: live.train_loss ?? last?.train_loss ?? null,
    lr: live.lr ?? last?.lr ?? null,
    grad_norm: live.grad_norm ?? last?.grad_norm ?? null,
    tokens_per_s: live.tokens_per_s ?? last?.tokens_per_s ?? null,
    pace_s_per_step: live.pace_s_per_step ?? null,
    val_loss: live.val_loss ?? last?.val_loss ?? null,
    temp_c: g?.temp_c ?? null,
    power_w: g?.power_w ?? null,
    clock_mhz: g?.clock_mhz ?? null,
    util_gpu: g?.util_gpu ?? null,
    vram_used_gb: g?.vram_used_gb ?? null,
    free_gb: live.disk?.free_gb ?? null,
  };
}

/** Append a sample, keeping the tail bounded. */
export function pushSample(
  samples: MetricSample[],
  sample: MetricSample,
  max = MAX_SAMPLES,
): MetricSample[] {
  return [...samples, sample].slice(-max);
}
