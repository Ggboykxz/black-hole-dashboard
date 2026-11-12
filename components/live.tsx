"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "./chart";
import Avatar from "./avatar";
import LiveVariations from "./variations";
import { useLiveFeed } from "./live-provider";
import { useHydratedClock } from "@/lib/use-mounted";
import { describeChange } from "@/lib/changes";
import { duration, f2, f4, hours, int, pct, step as fmtStep } from "@/lib/format";
import { ageOf } from "@/lib/live-store";
import { freshness, humanAge, STALE_AFTER_S } from "@/lib/signal";

interface Props {
  /** the snapshot's tail, so the chart is populated before the first poll */
  initial: { x: number; y: number }[];
  initialVal: { x: number; y: number }[];
  run: string;
  maxSteps: number;
  /** when the embedded snapshot was generated (the fallback's own age) */
  generatedAt?: string;
}

/** One measured number, with the exact value the producer wrote. */
function Tile({
  label,
  value,
  unit,
  sub,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.055] bg-white/[0.022] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.09em] text-faint">
        <span className="h-1 w-1 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="num mt-0.5 text-[16px] leading-tight text-ink">
        {value}
        {unit ? (
          <span className="ml-1 text-[9.5px] font-normal text-faint">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="num mt-0.5 text-[9.5px] text-faint">{sub}</div> : null}
    </div>
  );
}

function Gauge({
  label,
  value,
  detail,
  ratio,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  ratio: number;
  color: string;
}) {
  const w = Math.max(0, Math.min(100, ratio * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-dim">{label}</span>
        <span className="num text-ink">{value}</span>
      </div>
      <div className="mt-1 h-[4px] w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${w}%`, background: color }}
        />
      </div>
      {detail ? (
        <div className="mt-0.5 font-mono text-[9px] text-faint">{detail}</div>
      ) : null}
    </div>
  );
}

/**
 * The live panel.
 *
 * The data comes from the shared feed (`LiveProvider`): one poll for the
 * whole site, one journal, one change feed. This page is the *view* of that
 * feed — the headline, the freshness, the four measured numbers, the curve,
 * the material — and it never computes a second truth of its own.
 *
 * What it refuses to do:
 *
 * * present a frozen snapshot as live (`SNAPSHOT FIGÉ`, with the age);
 * * interpolate between two measurements (the curve stops where the data
 *   stops);
 * * hide a dead producer (the freshness bar runs down to zero and the
 *   banner says what to do).
 */
export default function LivePanel({
  initial,
  initialVal,
  run,
  maxSteps,
  generatedAt,
}: Props) {
  const feed = useLiveFeed();
  const { live, meta, state, age, error } = feed;

  // the series the chart draws: the shared journal, or the snapshot's tail
  // while the first poll is still in flight
  const rows = feed.rows.length
    ? feed.rows
    : initial.map((p) => ({ step: p.x, loss: p.y }));
  const vals = feed.vals.length
    ? feed.vals
    : initialVal.map((p) => ({ step: p.x, loss: p.y }));

  const clock = useHydratedClock();

  /** first measurement this tab actually saw — the basis of "vous avez vu" */
  const opened = useRef<{ t: number; step: number | null; loss: number | null }>({
    t: Date.now(),
    step: null,
    loss: null,
  });
  if (opened.current.step === null && live && Number.isFinite(live.step)) {
    opened.current = { t: Date.now(), step: live.step, loss: live.train_loss ?? null };
  }

  const nowStep = live?.step ?? rows[rows.length - 1]?.step ?? 0;
  const percent = maxSteps ? (100 * nowStep) / maxSteps : 0;
  const gpu = live?.gpu;
  const fresh = freshness(age);
  const embeddedAge = ageOf(generatedAt);

  const mood = useMemo(() => {
    if (!live) return "idle" as const;
    if (gpu && gpu.temp_c >= 75) return "hot" as const;
    if (live.pace_s_per_step && live.pace_s_per_step > 3.2) return "stalled" as const;
    if (live.step >= live.max_steps) return "done" as const;
    return "focus" as const;
  }, [live, gpu]);

  const caption = useMemo(() => {
    if (!live) return "Instantané embarqué — aucun signal live reçu.";
    const parts: string[] = [];
    if (gpu) parts.push(`GPU ${gpu.temp_c.toFixed(0)} °C`);
    if (live.pace_s_per_step) parts.push(`${f2(live.pace_s_per_step)} s/step`);
    if (live.eta_h) parts.push(`${hours(live.eta_h)} restantes`);
    if (mood === "hot")
      parts.push("carte bridée par la puissance — c'est le matériel, pas le pipeline");
    return parts.join(" · ");
  }, [live, gpu, mood]);

  const seenSteps =
    opened.current.step !== null && live ? live.step - opened.current.step : null;
  const seenS = Math.max(0, Math.round((clock - opened.current.t) / 1000));

  const stepSub =
    seenSteps !== null && seenSteps !== 0
      ? `vous avez vu ${seenSteps > 0 ? "+" : ""}${fmtStep(seenSteps)} steps en ${humanAge(seenS)}`
      : "aucun nouveau step depuis l'ouverture";

  const lossDelta =
    opened.current.loss !== null && live?.train_loss != null
      ? live.train_loss - opened.current.loss
      : null;

  const changes = feed.changes;

  /** the measured activity of the run: values actually changed in the last minute */
  const activityPerMin = useMemo(() => {
    const now = Date.now();
    return feed.changes.filter((c) => now - c.t <= 60_000).length;
  }, [feed.changes]);

  return (
    <div
      className="space-y-3"
      data-bot-target="live"
      style={{ ["--pulse-color" as string]: meta.color }}
    >
      {/* ── the signal header ─────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div
          className="h-[3px] w-full"
          style={{
            background: `linear-gradient(90deg, ${meta.color}, ${meta.color}22 70%, transparent)`,
          }}
        />
        <div className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`pulse ${state === "live" ? "" : "pulse-static"}`}
                style={{ background: meta.color }}
                title={meta.hint}
              />
              <span
                className="text-[12px] font-medium tracking-wide"
                style={{ color: meta.color }}
              >
                {meta.label}
              </span>
              <span
                className={`chip ${
                  feed.source === "cache"
                    ? "!border-warn/40 !text-warn"
                    : feed.source === "snapshot" || state === "none"
                      ? "!border-line !text-faint"
                      : ""
                }`}
              >
                {feed.source === "local"
                  ? "log local — vrai direct"
                  : feed.source === "hub"
                    ? "heartbeat Hub"
                    : feed.source === "cache"
                      ? "journal local"
                      : feed.source === "snapshot"
                        ? "instantané embarqué"
                        : "aucune source live"}
              </span>
              <span
                className="chip"
                title="âge du heartbeat, calculé depuis son updated_at"
              >
                signal : {humanAge(age)}
              </span>
              {feed.restored ? (
                <span className="chip" title="points restaurés depuis localStorage">
                  journal : {feed.cachePoints.toLocaleString("fr-FR")} pts
                  <button
                    onClick={feed.reset}
                    className="ml-1 text-faint transition-colors hover:text-bad"
                    title="effacer le journal local"
                  >
                    ✕
                  </button>
                </span>
              ) : null}
            </div>
            <div className="num text-[11px] text-faint">
              {live?.updated_at
                ? `écrit ${live.updated_at.replace("T", " ").slice(0, 19)} UTC`
                : generatedAt
                  ? `instantané du ${generatedAt.replace("T", " ").slice(0, 19)} UTC`
                  : ""}
            </div>
          </div>

          {/* freshness — falls with the producer's age, not the poll clock */}
          {state === "live" || state === "stale" ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between font-mono text-[9.5px] text-faint">
                <span>fraîcheur du producteur</span>
                <span style={{ color: meta.color }}>
                  {Math.round(fresh * 100)} % · seuil {STALE_AFTER_S} s
                </span>
              </div>
              <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
                  style={{ width: `${Math.round(fresh * 100)}%`, background: meta.color }}
                />
              </div>
            </div>
          ) : null}

          {/* the headline: step, share of the run, ETA */}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <div className="text-[9.5px] uppercase tracking-[0.14em] text-faint">
                step courant
              </div>
              <div className="num flex items-baseline gap-2 text-[34px] leading-none text-ink">
                {fmtStep(nowStep)}
                <span className="text-[13px] font-normal text-faint">
                  / {fmtStep(maxSteps)}
                </span>
                <span className="ml-1 text-[14px] font-normal" style={{ color: meta.color }}>
                  {pct(percent, 1)}
                </span>
              </div>
              <div className="mt-1 font-mono text-[9.5px] text-faint">{stepSub}</div>
            </div>
            <div className="flex items-end gap-5">
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.14em] text-faint">
                  cadence
                </div>
                <div className="num text-[18px] leading-tight text-ink">
                  {f2(live?.pace_s_per_step)}
                  <span className="ml-1 text-[9.5px] text-faint">s/step</span>
                </div>
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.14em] text-faint">
                  reste
                </div>
                <div className="num text-[18px] leading-tight text-ink">
                  {hours(live?.eta_h)}
                </div>
              </div>
            </div>
          </div>

          {/* the progress bar, with ticks every 5 % so the eye can measure */}
          <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full border border-white/[0.05] bg-[#0b0e14]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.min(100, percent)}%`,
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

          {/* the four measured numbers — exact producer precision */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label="perte train"
              value={f4(live?.train_loss)}
              unit="nats"
              color="#38bdf8"
              sub={
                lossDelta === null
                  ? "depuis l'ouverture : —"
                  : `depuis l'ouverture : ${lossDelta >= 0 ? "+" : "−"}${f4(Math.abs(lossDelta))}`
              }
            />
            <Tile
              label="learning rate"
              value={live?.lr ? live.lr.toExponential(3) : "—"}
              color="#94a3b8"
              sub="cosine, pas encore de gel"
            />
            <Tile label="grad norm" value={f2(live?.grad_norm)} color="#fbbf24" sub="clippé à 1.0" />
            <Tile
              label="débit"
              value={int(live?.tokens_per_s)}
              unit="tok/s"
              color="#34d399"
              sub={`${int(live?.tokens_per_s ? live.tokens_per_s * 60 : null)} tok/min`}
            />
          </div>

          {/* the states that must never look live */}
          {state === "frozen" || state === "none" ? (
            <div className="mt-3 rounded-lg border border-bad/40 bg-bad/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-bad/90">
              <strong className="font-medium">Aucune source live.</strong>{" "}
              {state === "frozen" ? (
                <>
                  <code className="text-accent">/api/live</code> renvoie
                  l&apos;instantané figé
                  {live?.updated_at
                    ? ` du ${live.updated_at.replace("T", " ").slice(0, 19)} UTC`
                    : embeddedAge !== null
                      ? ` (il y a ${humanAge(embeddedAge)})`
                      : ""}{" "}
                  au step {(live?.step ?? 0).toLocaleString("fr-FR")}. Aucune
                  nouvelle mesure n&apos;arrive : la traque des variations reste
                  à l&apos;arrêt plutôt que d&apos;afficher une fausse ligne
                  plate.
                </>
              ) : (
                <>
                  <code className="text-accent">/api/live</code> n&apos;a encore
                  répondu aucune mesure exploitable
                  {error ? (
                    <>
                      {" "}
                      (<span className="font-mono">{error}</span>)
                    </>
                  ) : null}
                  . Aucune valeur de substitution n&apos;est affichée.
                </>
              )}{" "}
              En local, vérifier{" "}
              <code className="text-accent">runs/bh-005/live.json</code> ; sur
              Vercel, définir <code className="text-accent">HF_TOKEN</code> ou
              rendre le dépôt{" "}
              <code className="text-accent">Ggboykxz/black-hole-live</code>{" "}
              public.
            </div>
          ) : state === "stale" ? (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10.5px] leading-relaxed text-warn/90">
              <strong className="font-medium">Le producteur s&apos;est tu.</strong>{" "}
              Aucune nouvelle mesure depuis {humanAge(age)} : les chiffres
              ci-dessus sont les <em>derniers reçus</em>, à leur valeur exacte,
              et la courbe s&apos;arrête là où la mesure s&apos;arrête. Le
              heartbeat écrit toutes les 30 s ; un silence de plus de{" "}
              {STALE_AFTER_S} s signifie que la chaîne est interrompue.
            </p>
          ) : state === "offline" ? (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[10.5px] leading-relaxed text-warn/90">
              La requête live a échoué
              {error ? (
                <>
                  {" "}
                  (<span className="font-mono">{error}</span>)
                </>
              ) : null}{" "}
              — la page affiche le dernier état connu, avec son âge. Rien
              n&apos;est recalculé, rien n&apos;est inventé.
              {feed.source === "cache"
                ? " Le journal local survit au rechargement ; il ne remplace pas le trainer."
                : embeddedAge !== null
                  ? ` L'instantané embarqué date de ${humanAge(embeddedAge)}.`
                  : ""}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── the change feed: every value that moved ───────────────────── */}
      <div className="card p-4" data-bot-target="changes">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-tight text-ink">
            Journal des changements
          </h3>
          <span className="font-mono text-[10px] text-faint">
            {feed.changeCount} changement{feed.changeCount > 1 ? "s" : ""} depuis
            l&apos;ouverture · une ligne par valeur modifiée, à la précision du
            producteur
          </span>
        </div>

        {changes.length === 0 ? (
          <p className="rounded-lg border border-line bg-[#0a0d13]/60 px-3 py-2.5 text-[11px] leading-relaxed text-dim">
            {feed.samples.length < 2
              ? "En attente de deux mesures distinctes : le journal s'écrit dès que le producteur publie une valeur nouvelle."
              : "Aucune valeur n'a bougé depuis la dernière mesure reçue. Le log du trainer n'écrit qu'une ligne toutes les 10 steps (~26 s) : un silence de quelques secondes est normal."}
          </p>
        ) : (
          <ul className="relative max-h-[340px] space-y-0.5 overflow-y-auto pr-1">
            {/* the timeline: a line, and one dot per measured change */}
            <span className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-px bg-white/[0.07]" />
            {changes.slice(0, 60).map((c) => (
              <li
                key={c.id}
                className="group relative flex items-baseline gap-2 rounded-md py-1 pl-5 pr-1.5 text-[11px] hover:bg-white/[0.03]"
              >
                <span
                  className="absolute left-[4px] top-[7px] h-[7px] w-[7px] rounded-full ring-4 ring-[#0f1218]"
                  style={{
                    background: c.color,
                    boxShadow: `0 0 8px ${c.color}66`,
                  }}
                />
                <span className="num shrink-0 font-mono text-[9.5px] text-faint">
                  {new Date(c.t).toLocaleTimeString("fr-FR")}
                </span>
                <span
                  className={
                    c.level === "warn"
                      ? "text-warn"
                      : c.trend === "bad"
                        ? "text-bad"
                        : c.trend === "good"
                          ? "text-good"
                          : "text-dim"
                  }
                >
                  {describeChange(c)}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-faint">
                  {c.origin}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── the variation strip ───────────────────────────────────────── */}
      <div className="card p-4">
        <LiveVariations
          live={live}
          samples={feed.samples}
          offline={state === "offline" || state === "stale"}
          staticOnly={state === "frozen"}
          ageS={age}
          compact
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[12.5px] text-ink">
              Perte d&apos;entraînement (live)
            </h3>
            <span className="font-mono text-[10px] text-faint">
              runs/{run}/log.jsonl — une ligne / 10 steps
            </span>
          </div>
          <Chart
            height={230}
            series={[
              {
                label: "train loss",
                color: "#38bdf8",
                points: rows.map((r) => ({ x: r.step, y: r.loss })),
                area: true,
              },
            ]}
            xFormat="step"
            yFormat="loss3"
          />
          {vals.length > 1 ? (
            <div className="mt-4" data-bot-target="chart-val">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-[12.5px] text-ink">
                  Évaluation du run (20 batches)
                </h3>
                <span className="font-mono text-[10px] text-faint">
                  tendance seule — jamais le chiffre publié
                </span>
              </div>
              <Chart
                height={170}
                series={[
                  {
                    label: "val (run)",
                    color: "#a78bfa",
                    points: vals.map((r) => ({ x: r.step, y: r.loss })),
                  },
                ]}
                xFormat="step"
                yFormat="loss3"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="card p-4">
            <Avatar
              mood={mood}
              intensity={percent / 100}
              label={`Avatar du run ${run}`}
              caption={caption}
              pace={live?.pace_s_per_step ?? null}
              ageS={age}
              percent={percent / 100}
              activity={activityPerMin}
            />
          </div>

          {gpu ? (
            <div className="card p-4" data-bot-target="gpu">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-[12.5px] text-ink">Matériel</h3>
                <span className="chip !px-1.5 !py-0 !text-[9px]">{gpu.name}</span>
              </div>
              <div className="space-y-2.5">
                <Gauge
                  label="Température"
                  value={`${f2(gpu.temp_c)} °C`}
                  ratio={gpu.temp_c / 95}
                  color={gpu.temp_c >= 78 ? "#f97316" : "#fbbf24"}
                  detail={
                    gpu.temp_c >= 78 ? "proche du plafond thermique" : "sous le plafond"
                  }
                />
                <Gauge
                  label="Puissance"
                  value={`${f2(gpu.power_w)} / ${f2(gpu.power_limit_w)} W`}
                  ratio={gpu.power_limit_w ? gpu.power_w / gpu.power_limit_w : 0}
                  color="#fbbf24"
                  detail={
                    gpu.power_limit_w && gpu.power_w / gpu.power_limit_w > 0.92
                      ? "power-cap : la carte se bride elle-même"
                      : undefined
                  }
                />
                <Gauge
                  label="Horloge SM"
                  value={`${int(gpu.clock_mhz)} / ${int(gpu.clock_max_mhz)} MHz`}
                  ratio={gpu.clock_max_mhz ? gpu.clock_mhz / gpu.clock_max_mhz : 0}
                  color="#38bdf8"
                />
                <Gauge
                  label="VRAM"
                  value={`${f2(gpu.vram_used_gb)} / ${f2(gpu.vram_total_gb)} Go`}
                  ratio={gpu.vram_total_gb ? gpu.vram_used_gb / gpu.vram_total_gb : 0}
                  color="#a78bfa"
                />
                <Gauge
                  label="Utilisation GPU"
                  value={`${f2(gpu.util_gpu)} %`}
                  ratio={gpu.util_gpu / 100}
                  color="#34d399"
                  detail={`disque libre ${f2(live?.disk?.free_gb)} Go`}
                />
              </div>
              {feed.history.length > 2 ? (
                <div className="mt-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-faint">
                    température &amp; horloge (dernière heure)
                  </div>
                  <Chart
                    height={130}
                    series={[
                      {
                        label: "température (°C)",
                        color: "#f97316",
                        points: feed.history.map((h) => ({ x: h.t, y: h.temp_c })),
                        area: true,
                      },
                    ]}
                    xFormat="time"
                    yFormat="loss2"
                  />
                  <div className="mt-3">
                    <Chart
                      height={130}
                      series={[
                        {
                          label: "horloge SM (MHz)",
                          color: "#38bdf8",
                          points: feed.history.map((h) => ({ x: h.t, y: h.clock_mhz })),
                          area: true,
                        },
                      ]}
                      xFormat="time"
                      yFormat="int"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {live?.processes?.length ? (
            <div className="card p-4" data-bot-target="processes">
              <h3 className="mb-2 text-[12.5px] text-ink">Processus</h3>
              <ul className="space-y-1.5 text-[11.5px]">
                {live.processes.map((p) => (
                  <li key={`${p.role}-${p.pid}`} className="flex justify-between gap-3">
                    <span className="text-dim">
                      {p.role}
                      <span className="num ml-1 text-faint">pid {p.pid}</span>
                    </span>
                    <span className="num text-ink">{duration(p.up_s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
