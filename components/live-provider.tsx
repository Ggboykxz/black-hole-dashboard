"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Live } from "@/lib/types";
import {
  ageOf,
  clearLive,
  MAX_HISTORY,
  MAX_SAMPLES,
  mergeRows,
  mergeVals,
  pushSample,
  readLive,
  sampleFrom,
  writeLive,
  type LiveRow,
  type MetricSample,
} from "@/lib/live-store";
import { diffSamples, type Change } from "@/lib/changes";
import { SPECS, isNum } from "@/lib/metrics";
import {
  freshness,
  SIGNAL_META,
  signalState,
  type SignalMeta,
  type SignalSource,
  type SignalState,
} from "@/lib/signal";

/**
 * The one live feed of the dashboard.
 *
 * Before this provider, three components each polled `/api/live` on their
 * own: the live panel, the variation page and the notification centre. The
 * result was three requests per three seconds, three slightly different
 * freshness rules — and a **header that never moved**, because it was
 * rendered on the server from the embedded snapshot while claiming to be
 * "live".
 *
 * Now there is exactly one poll, one journal and one change feed:
 *
 * * the payload, its age and the *state* of the signal (live, stale,
 *   offline, frozen, none) are shared by every view;
 * * one sample is stored per **new measurement** — never per poll, so the
 *   tracker never invents a variation out of two identical reads;
> * every value that moves produces a `Change` line with the exact
 *   before/after, which is what the notifications and the live page show.
 *
 * The rules stay the same: nothing is interpolated, nothing is faked, and a
 * frozen source is never presented as a live one.
 */

export const POLL_MS = 3000;
/** how many change lines are kept in memory */
const MAX_CHANGES = 400;

/**
 * The signature of a measurement.
 *
 * Two polls that read the *same* values are not two measurements: they are
 * the same one, read twice. The signature is therefore built from the
 * values themselves — at the producer's precision — and not from a
 * timestamp: in local mode the API stamps `updated_at` with the time of the
 * read, so a timestamp would create a new sample every 3 s and draw a flat
 * line that pretends to track.
 */
function signature(s: MetricSample): string {
  return SPECS.map((spec) => {
    const v = s[spec.key];
    if (!isNum(v)) return "-";
    return spec.sci ? v.toExponential(6) : v.toFixed(spec.digits);
  }).join("|");
}

export interface LiveFeed {
  /** the last payload received */
  live: Live | null;
  /** which source answered: local, hub, snapshot, cache or none */
  source: SignalSource;
  /** the honest state of that source */
  state: SignalState;
  meta: SignalMeta;
  /** age of the producer's own `updated_at`, in seconds */
  age: number | null;
  /** 0..1 — how fresh the signal is, 1 = just written */
  fresh: number;
  /** the exact reason of the last failure */
  error: string | null;
  /** has a poll ever completed (success or failure)? */
  attempted: boolean;
  /** no payload has been received yet: the views must say "unknown", not "dead" */
  unknown: boolean;
  /** was the journal restored from localStorage? */
  restored: boolean;
  /** how many chart points the journal holds */
  cachePoints: number;
  /** the per-measurement journal */
  samples: MetricSample[];
  /** the train-loss series (merged with the snapshot's tail) */
  rows: LiveRow[];
  /** the validation series */
  vals: LiveRow[];
  /** the GPU history (temperature, clock) */
  history: { t: number; temp_c: number; clock_mhz: number }[];
  /** every value that moved, newest first */
  changes: Change[];
  /** when the last change was detected */
  lastChangeAt: number | null;
  /** how many changes were detected since the page was opened */
  changeCount: number;
  /** forget the local journal */
  reset: () => void;
}

const LiveContext = createContext<LiveFeed | null>(null);

export function useLiveFeed(): LiveFeed {
  const ctx = useContext(LiveContext);
  if (!ctx) {
    throw new Error("useLiveFeed must be used inside <LiveProvider>");
  }
  return ctx;
}

export function LiveProvider({
  children,
  initialRows = [],
  initialVals = [],
}: {
  children: React.ReactNode;
  initialRows?: LiveRow[];
  initialVals?: LiveRow[];
}) {
  const [live, setLive] = useState<Live | null>(null);
  const [rows, setRows] = useState<LiveRow[]>(initialRows);
  const [vals, setVals] = useState<LiveRow[]>(initialVals);
  const [history, setHistory] = useState<
    { t: number; temp_c: number; clock_mhz: number }[]
  >([]);
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [age, setAge] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [cachePoints, setCachePoints] = useState(0);
  const [changeCount, setChangeCount] = useState(0);

  const liveRef = useRef<Live | null>(null);
  const rowsRef = useRef<LiveRow[]>(initialRows);
  const valsRef = useRef<LiveRow[]>(initialVals);
  const historyRef = useRef<{ t: number; temp_c: number; clock_mhz: number }[]>([]);
  const samplesRef = useRef<MetricSample[]>([]);
  const changesRef = useRef<Change[]>([]);
  const lastSigRef = useRef<string | null>(null);

  // ---- restore the journal before the first poll -------------------------
  useEffect(() => {
    const saved = readLive();
    if (!saved) return;
    liveRef.current = saved.payload;
    rowsRef.current = saved.rows;
    valsRef.current = saved.vals;
    historyRef.current = saved.history;
    samplesRef.current = saved.samples ?? [];
    setLive(saved.payload);
    setRows(saved.rows);
    setVals(saved.vals);
    setHistory(saved.history);
    setSamples(samplesRef.current);
    setRestored(true);
    setCachePoints(saved.rows.length);
    setAge(ageOf(saved.payload.updated_at));
  }, []);

  // ---- the single poll ---------------------------------------------------
  useEffect(() => {
    let alive = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) detail = body.error;
          } catch {
            /* keep the status code */
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as Live;
        if (!alive) return;

        liveRef.current = data;
        setLive(data);
        setError(null);

        const hist = (data.gpu_history ?? []) as {
          t: string;
          temp_c: number;
          clock_mhz: number;
        }[];
        if (hist.length) {
          historyRef.current = hist
            .map((h) => ({
              t: new Date(h.t).getTime(),
              temp_c: h.temp_c,
              clock_mhz: h.clock_mhz,
            }))
            .slice(-MAX_HISTORY);
          setHistory(historyRef.current);
        }

        const fresh = (data.rows ?? [])
          .filter((r) => r.step !== undefined && r.train_loss != null)
          .map((r) => ({ step: r.step, loss: r.train_loss as number }));
        if (fresh.length) {
          const merged = mergeRows(rowsRef.current, fresh);
          rowsRef.current = merged;
          setRows(merged);
        }

        const v = (data.rows ?? [])
          .filter((r) => r.step !== undefined && r.val_loss != null)
          .map((r) => ({ step: r.step, loss: r.val_loss as number }));
        if (v.length) {
          const merged = mergeVals(valsRef.current, v);
          valsRef.current = merged;
          setVals(merged);
        }

        // ---- one sample per *new measurement* ----------------------------
        // The heartbeat only changes when the producer wrote something new
        // (the log every 10 steps, the GPU every beat). Re-appending an
        // unchanged payload every 3 s would draw a flat line and pretend to
        // track: the sample is written only when the *values* really moved.
        const sample = sampleFrom(data);
        const sig = signature(sample);
        if (sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          const stamp = `${data.source ?? ""}|${data.updated_at}|${sig.length}`;
          const prev = samplesRef.current[samplesRef.current.length - 1] ?? null;
          const diff = diffSamples(prev, sample, stamp);
          samplesRef.current = pushSample(samplesRef.current, sample);
          setSamples(samplesRef.current);
          if (diff.length) {
            changesRef.current = [...diff, ...changesRef.current].slice(0, MAX_CHANGES);
            setChanges(changesRef.current);
            setChangeCount((n) => n + diff.length);
          }
        }

        writeLive({
          v: 1,
          savedAt: Date.now(),
          payload: data,
          rows: rowsRef.current,
          vals: valsRef.current,
          history: historyRef.current,
          samples: samplesRef.current,
        });
        setCachePoints(rowsRef.current.length);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "requête échouée");
        }
      } finally {
        if (alive) setAttempted(true);
      }
    };

    void poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  // ---- the honest clock: the age is recomputed every second --------------
  useEffect(() => {
    const tick = () => setAge(ageOf(liveRef.current?.updated_at));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);

  const reset = useCallback(() => {
    clearLive();
    samplesRef.current = [];
    changesRef.current = [];
    setSamples([]);
    setChanges([]);
    setChangeCount(0);
    setRestored(false);
    setCachePoints(0);
  }, []);

  const source: SignalSource = useMemo(() => {
    if (live?.source === "snapshot") return "snapshot";
    if (live?.source === "local") return "local";
    if (live?.source === "hub") return "hub";
    if (restored) return "cache";
    return "none";
  }, [live, restored]);

  const state = useMemo(
    () =>
      signalState({
        source,
        ageS: age,
        attempted,
        fetchFailed: Boolean(error),
        hasData: live !== null,
      }),
    [source, age, attempted, error, live],
  );

  /**
   * The first poll has not answered yet: the dashboard knows *nothing*, and
   * must say so rather than show zeros or a stale snapshot. `unknown` is
   * the flag every view uses to distinguish "je ne sais pas" (waiting) from
   * "c'est faux" (alert).
   */
  const unknown = live === null;

  const value: LiveFeed = useMemo(
    () => ({
      live,
      source,
      state,
      meta: SIGNAL_META[state],
      age,
      fresh: freshness(age),
      error,
      attempted,
      unknown,
      restored,
      cachePoints,
      samples,
      rows,
      vals,
      history,
      changes,
      lastChangeAt: changes.length ? changes[0].t : null,
      changeCount,
      reset,
    }),
    [
      live,
      source,
      state,
      age,
      error,
      attempted,
      unknown,
      restored,
      cachePoints,
      samples,
      rows,
      vals,
      history,
      changes,
      changeCount,
      reset,
    ],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
