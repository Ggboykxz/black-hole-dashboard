"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { Stat, Badge } from "./ui";
import { Focusable } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { useLiveFeed } from "./live-provider";
import { SignalAge } from "./live-clock";
import Sparkline from "./sparkline";
import { compact, f2, f4, f5, hours, int, pct, step as fmtStep } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";

/**
 * The hero of the synthesis page.
 *
 * Every number the producer measures is the live one — step, loss, learning
 * rate, throughput, pace — and the badge says *which* state the signal is in,
 * with its age. The values that are not live by nature (the official
 * benchmark, the reasoning series, the tokens seen) stay on the snapshot,
 * and say so.
 *
 * The step rolls from the previous poll's value instead of snapping: the
 * producer writes once per ~26 s, and a step that jumps by twenty reads as a
 * glitch while a number that glides there reads as the run progressing. Only
 * the integer step is animated; the losses are printed at producer precision
 * and never interpolated.
 */
export default function Hero({ snapshot }: { snapshot: Snapshot }) {
  const feed = useLiveFeed();
  const { live, meta, state, source } = feed;
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

  const stepShown = useCountUp(step, 520);

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

  const progress = Math.max(0, Math.min(100, percent ?? 0));

  /* Every sparkline is a real series: the journal's train/val tails, the
     official benchmark points, the paired reasoning series, the published LR
     schedule. Throughput is the one figure the producer writes as a single
     value — its sparkline only exists once the feed has actually sampled it,
     and nothing is drawn before that. */
  const trainSpark = feed.rows.map((r) => r.loss).slice(-80);
  const valSpark = feed.vals.map((r) => r.loss).slice(-80);
  const benchSpark = bench.map((b) => b.loss);
  const reasonSpark = snapshot.paired.map((p) => p.reasoning);
  const lrSpark = snapshot.series.lr.map((p) => p.lr).slice(-80);
  const tokSpark = feed.samples
    .map((s) => s.tokens_per_s)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .slice(-80);

  return (
    <div
      className="card relative overflow-hidden"
      style={{ ["--pulse-color" as string]: meta.color }}
    >
      {/* the state's colour: a hairline, a soft light, and nothing that
          pretends the numbers are fresher than they are */}
      <div
        className="relative z-10 h-[3px] w-full"
        style={{
          background: `linear-gradient(90deg, ${meta.color}, ${meta.color}55 45%, transparent 92%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl"
        style={{ background: meta.color, opacity: 0.1 }}
      />

      <div className="relative p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`pulse ${state === "live" ? "" : "pulse-static"}`}
                style={{ background: meta.color }}
                title={meta.hint}
              />
              <span
                className="text-[10px] font-medium tracking-[0.16em]"
                style={{ color: meta.color }}
              >
                {st.run.toUpperCase()} · {meta.label}
              </span>
              <span className="chip !py-[2px] !text-[9.5px]">
                signal <SignalAge updatedAt={live?.updated_at} className="text-ink" />
              </span>
              <span className="hidden font-mono text-[9.5px] text-faint sm:inline">
                {sourceLabel}
              </span>
            </div>

            <h1 className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 leading-none">
              <span className="hero-step num text-[38px] font-medium tracking-[-0.03em] md:text-[44px]">
                {fmtStep(stepShown)}
              </span>
              <span className="num text-[15px] font-normal text-faint">
                / {fmtStep(maxSteps)} steps
              </span>
              <span
                className="num rounded-full border px-2 py-[2px] text-[10px]"
                style={{
                  color: meta.color,
                  borderColor: `${meta.color}44`,
                  background: `${meta.color}0d`,
                }}
              >
                {pct(percent, 1)}
              </span>
            </h1>

            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-dim">
              <span>{hours(eta)} de T4 restantes</span>
              <span className="text-line">·</span>
              <span className="num">{f2(pace)} s/step</span>
              <span className="text-line">·</span>
              <span className="num">{int(tok)} tok/s</span>
              <span className="text-line">·</span>
              <span className="num">
                {int(st.tokens_seen)} tokens vus
                {st.tokens_this_run
                  ? ` (${compact(st.tokens_this_run)} par ce run)`
                  : ""}
              </span>
            </p>

            {/* the run's progress, with ticks every 5 % so the eye can
                measure without reading the percentage */}
            <div className="mt-4 max-w-2xl">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/[0.05] bg-[#0b0e14]">
                <div
                  className="h-full rounded-full transition-[width] duration-1000 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${meta.color}, #a78bfa)`,
                    boxShadow: `0 0 18px -4px ${meta.color}`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 flex justify-between px-[1px]">
                  {Array.from({ length: 21 }).map((_, i) => (
                    <span key={i} className="w-px bg-white/[0.09]" />
                  ))}
                </div>
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[9px] text-faint">
                <span>0</span>
                <span className="text-dim">
                  {fmtStep(step)} / {fmtStep(maxSteps)}
                </span>
                <span>{fmtStep(maxSteps)}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {/* the tooltip explains the protocol: a badge that says
                « bench 3.85 @ 24500 » without saying how it was measured
                invites the wrong comparison with the run's val */}
            <TooltipTrigger delay={0}>
              <Focusable>
                <Badge tone="accent">
                  bench {last ? f5(last.loss) : "—"} @ {last?.step ?? "—"}
                </Badge>
              </Focusable>
              <Tooltip>
                protocole fixe val-25×8×1024-seed1234-fp16 — étiqueté au step
                de son checkpoint ; diffère de la val du run de quelques 1e-2
              </Tooltip>
            </TooltipTrigger>
            <Badge tone={p5?.verdict === "miss" ? "bad" : "muted"}>
              P5 {p5?.verdict === "miss" ? "manquée" : "—"}
            </Badge>
            <span className="num text-right text-[9px] leading-relaxed text-faint">
              {live?.updated_at
                ? `écrit ${live.updated_at.replace("T", " ").slice(11, 19)} UTC`
                : "aucune mesure reçue"}
              <br />
              <span style={{ color: meta.color }}>{meta.label.toLowerCase()}</span>
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="perte d'entraînement"
            value={f4(loss)}
            sub={live?.train_loss !== null && live?.train_loss !== undefined ? "live · tendance seule" : "instantané"}
            tone="accent"
            spark={
              trainSpark.length > 2 ? (
                <Sparkline values={trainSpark} color="#38bdf8" className="h-7 w-full" />
              ) : undefined
            }
          />
          <Stat
            label="éval du run"
            value={val !== null ? f4(val) : "—"}
            sub={st.val_last ? `au step ${fmtStep(st.val_last.step)}` : "—"}
            spark={
              valSpark.length > 2 ? (
                <Sparkline values={valSpark} color="#a78bfa" className="h-7 w-full" />
              ) : undefined
            }
          />
          <Stat
            label="bench officiel"
            value={last ? f5(last.loss) : "—"}
            sub={last ? `ppl ${f2(last.ppl)} · @ ${fmtStep(last.step)}` : "—"}
            tone="accent"
            spark={
              benchSpark.length > 2 ? (
                <Sparkline values={benchSpark} color="#38bdf8" className="h-7 w-full" />
              ) : undefined
            }
          />
          <Stat
            label="raisonnement (M5)"
            value={
              snapshot.paired.length
                ? f4(snapshot.paired[snapshot.paired.length - 1].reasoning)
                : "—"
            }
            sub="in-domain, pas un transfert"
            tone="warn"
            spark={
              reasonSpark.length > 2 ? (
                <Sparkline values={reasonSpark} color="#fbbf24" className="h-7 w-full" />
              ) : undefined
            }
          />
          <Stat
            label="LR"
            value={(lr ?? 0).toExponential(3)}
            sub="cosine → 1e-5"
            spark={
              lrSpark.length > 2 ? (
                <Sparkline values={lrSpark} color="#94a3b8" className="h-7 w-full" />
              ) : undefined
            }
          />
          <Stat
            label="cadence"
            value={f2(pace)}
            sub={`s/step · ${int(tok)} tok/s`}
            spark={
              tokSpark.length > 2 ? (
                <Sparkline values={tokSpark} color="#34d399" className="h-7 w-full" />
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
