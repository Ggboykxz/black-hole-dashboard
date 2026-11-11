"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { Stat, Badge } from "./ui";
import { useLiveFeed } from "./live-provider";
import { compact, f2, f4, f5, hours, int, pct, step as fmtStep } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";
import { humanAge } from "@/lib/signal";

/**
 * The hero of the synthesis page.
 *
 * It used to be a server component reading the embedded snapshot: a green
 * "live" dot over frozen numbers. Now every number that the producer
 * measures is the live one — step, loss, learning rate, throughput, pace —
 * and the badge says *which* state the signal is in, with its age.
 *
 * The values that are not live by nature (the official benchmark, the
 * reasoning series, the tokens seen) stay on the snapshot, and say so.
 */
export default function Hero({ snapshot }: { snapshot: Snapshot }) {
  const feed = useLiveFeed();
  const { live, meta, state, age, source } = feed;
  const st = snapshot.status;
  const bench = snapshot.benchmarks;
  const last = bench[bench.length - 1];
  const p5 = snapshot.predictions.find((p) => p.id === "P5");

  const step = live?.step ?? st.step;
  const maxSteps = live?.max_steps ?? st.max_steps;
  const percent =
    live?.percent ?? (maxSteps ? (100 * step) / maxSteps : st.percent);
  const pace = live?.pace_s_per_step ?? st.pace_s_per_step;
  const eta = live?.eta_h ?? st.eta_h;
  const tok = live?.tokens_per_s ?? st.tokens_per_s;
  const loss = live?.train_loss ?? st.train_loss;
  const lr = live?.lr ?? st.lr;
  const val = live?.val_loss ?? st.val_last?.loss ?? null;

  /* the headline step rolls from the previous poll's value instead of
     snapping — the poll lands every 30 s and a step that jumps by
     twenty reads as a glitch, while a number that glides there reads
     as the run progressing (BoardUI's use-count-up, integers only —
     the hook rounds, so it never dresses the losses) */
  const stepShown = useCountUp(step, 420);

  const sourceLabel = useMemo(
    () =>
      source === "local"
        ? "log local — vrai direct"
        : source === "hub"
          ? "heartbeat Hub"
          : source === "cache"
            ? "journal local"
            : source === "snapshot"
              ? "instantané figé"
              : "aucune source live",
    [source],
  );

  return (
    <div className="card overflow-hidden" style={{ ["--pulse-color" as string]: meta.color }}>
      <div
        className="h-[3px] w-full"
        style={{
          background: `linear-gradient(90deg, ${meta.color}, ${meta.color}22 70%, transparent)`,
        }}
      />
      <div className="relative p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`pulse ${state === "live" ? "" : "pulse-static"}`}
                style={{ background: meta.color }}
                title={meta.hint}
              />
              <span
                className="text-[11px] tracking-[0.18em]"
                style={{ color: meta.color }}
              >
                {st.run.toUpperCase()} · {meta.label}
              </span>
              <span className="font-mono text-[10px] text-faint">
                signal {humanAge(age)}
              </span>
            </div>
            <h1 className="num mt-1.5 text-[26px] leading-tight font-medium tracking-tight text-ink">
              {fmtStep(stepShown)}{" "}
              <span className="text-faint">/ {fmtStep(maxSteps)} steps</span>
            </h1>
            <p className="mt-1 text-[12.5px] text-dim">
              {pct(percent, 1)} du run · {hours(eta)} de T4 restantes à{" "}
              {f2(pace)} s/step · {int(tok)} tok/s ·{" "}
              {int(st.tokens_seen)} tokens vus{" "}
              {st.tokens_this_run ? `(${compact(st.tokens_this_run)} par ce run)` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone="accent">
              bench {last ? f5(last.loss) : "—"} @ {last?.step ?? "—"}
            </Badge>
            <Badge tone={p5?.verdict === "miss" ? "bad" : "muted"}>
              P5 {p5?.verdict === "miss" ? "manquée" : "—"}
            </Badge>
            <span className="font-mono text-[10px] text-faint">
              source : {sourceLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6">
          <Stat
            label="perte d'entraînement"
            value={f4(loss)}
            sub={live?.train_loss ? "live · tendance seule" : "instantané"}
          />
          <Stat
            label="éval du run"
            value={val !== null ? f4(val) : "—"}
            sub={st.val_last ? `au step ${fmtStep(st.val_last.step)}` : "—"}
          />
          <Stat
            label="bench officiel"
            value={last ? f5(last.loss) : "—"}
            sub={last ? `ppl ${f2(last.ppl)} · @ ${fmtStep(last.step)}` : "—"}
            tone="accent"
          />
          <Stat
            label="raisonnement (M5)"
            value={
              snapshot.paired.length ? f4(snapshot.paired[snapshot.paired.length - 1].reasoning) : "—"
            }
            sub="in-domain, pas un transfert"
            tone="warn"
          />
          <Stat
            label="LR"
            value={(lr ?? 0).toExponential(3)}
            sub="cosine → 1e-5"
          />
          <Stat
            label="cadence"
            value={f2(pace)}
            sub={`s/step · ${int(tok)} tok/s`}
          />
        </div>
      </div>
    </div>
  );
}
