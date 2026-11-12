import type { Snapshot } from "./types";

export interface Step {
  id: string;
  phase: string;
  title: string;
  status: "done" | "active" | "pending" | "blocked";
  /** 0..1 — null when it cannot be measured */
  progress: number | null;
  detail: string;
  /** when it is expected (a date, an ETA, a step number) */
  when: string;
  source: string;
}

/**
 * The roadmap — derived, never written by hand.
 *
 * Every step below is read from an artefact: the run's own log for the
 * training milestones, `docs/PREDICTIONS.md` for the hypotheses still open,
 * `docs/METRICS.md` §5 for the declared gaps. When the run advances, the
 * roadmap advances with it: nothing here has to be updated by hand, and
 * nothing here can be wrong for long.
 */
export function buildRoadmap(snapshot: Snapshot): Step[] {
  const steps: Step[] = [];
  const st = snapshot.status;
  const maxSteps = st.max_steps || 58000;
  const step = st.step;
  const pace = st.pace_s_per_step || 0;
  const etaH = st.eta_h ?? 0;

  const inHours = (stepsAhead: number) =>
    pace ? `~${((stepsAhead * pace) / 3600).toFixed(1).replace(".", ",")} h` : "—";

  // ---------------------------------------------------- phase 1 : the run
  steps.push({
    id: "run",
    phase: "1 · entraînement",
    title: `bh-005 — ${step.toLocaleString("fr-FR")} / ${maxSteps.toLocaleString("fr-FR")} steps`,
    status: "active",
    progress: step / maxSteps,
    detail:
      "Prétraining continue sur FineWeb + NuminaMath-CoT (21,94 % de raisonnement). La courbe officielle oscille autour de 3,89 : c'est la mesure, pas une promesse.",
    when: `fin dans ~${etaH.toFixed(1).replace(".", ",")} h de T4`,
    source: "runs/bh-005/log.jsonl",
  });

  const nextCkpt = Math.ceil((step + 1) / 500) * 500;
  steps.push({
    id: "next-ckpt",
    phase: "1 · entraînement",
    title: `Checkpoint suivant : ckpt_step${nextCkpt.toLocaleString("fr-FR")}.pt`,
    status: "pending",
    progress: (nextCkpt - step) / 500,
    detail:
      "Écrit puis poussé par le trainer, élagué à 2 sur le Hub. C'est la garantie de reprise : 500 steps ≈ 18 min de T4.",
    when: inHours(nextCkpt - step),
    source: "configs/train-100m-bh005.json (save_every)",
  });

  const nextBench = Math.ceil((step + 1) / 500) * 500;
  steps.push({
    id: "next-bench",
    phase: "1 · entraînement",
    title: `Mesure officielle suivante : step ${nextBench.toLocaleString("fr-FR")}`,
    status: "pending",
    progress: (nextBench - step) / 500,
    detail:
      "Le keepalive benchmarke chaque checkpoint nouveau (25 × 8 × 1 024, graine 1234, fp16, ~16 s) puis reconstruit la courbe et les tableaux.",
    when: inHours(nextBench - step),
    source: "scripts/benchmark.py",
  });

  // ------------------------------------------- phase 2 : what the run must answer
  const p8 = snapshot.predictions.find((p) => p.id === "P8");
  steps.push({
    id: "p8",
    phase: "2 · la question du run",
    title: "P8 — le benchmark final au step 58 000",
    status: p8 && p8.verdict !== "pending" ? "done" : "pending",
    progress: step / maxSteps,
    detail:
      p8?.prediction ??
      "≤ 3,60 au step 58 000 — c'est le chiffre qui dira si les 33 h de tokens supplémentaires valaient quelque chose.",
    when: `dans ~${etaH.toFixed(1).replace(".", ",")} h`,
    source: "docs/PREDICTIONS.md (P8)",
  });

  // ------------------------------------------------ phase 3 : the measurements
  for (const g of snapshot.gaps) {
    steps.push({
      id: `gap-${g.gap}`,
      phase: "3 · mesures à faire",
      title: g.gap,
      status: "pending",
      progress: null,
      detail: `${g.consequence} → ${g.next}`,
      when: "dès que le GPU est libre",
      source: "docs/METRICS.md §5",
    });
  }

  // ------------------------------------------------------ phase 4 : the SFT
  for (const p of snapshot.predictions) {
    if (!["P6", "P12", "P13"].includes(p.id)) continue;
    steps.push({
      id: `sft-${p.id}`,
      phase: "4 · instruction tuning",
      title: `${p.id} — ${p.question.slice(0, 90)}`,
      status: p.verdict === "pending" ? "pending" : "done",
      progress: null,
      detail: p.prediction,
      when: "après la fin du run (GPU libre)",
      source: `docs/PREDICTIONS.md (${p.id})`,
    });
  }

  // --------------------------------------------------- phase 5 : publication
  steps.push({
    id: "export",
    phase: "5 · publication",
    title: "Export du checkpoint final + carte de modèle",
    status: "pending",
    progress: null,
    detail:
      "blackhole.export vers exports/black-hole-100m-v2, puis push sur le Hub. Le générateur de carte refuse désormais de publier un zéro à la place d'une mesure.",
    when: "après la fin du run",
    source: "docs/MODEL_CARD.md + scripts/backup.py",
  });

  steps.push({
    id: "dashboard-live",
    phase: "5 · publication",
    title: "Dashboard live en ligne",
    status: "active",
    progress: 1,
    detail:
      "Le dashboard est publié sur GitHub (Ggboykxz/black-hole-dashboard) et déployable sur Vercel ; le heartbeat et l'instantané sont poussés à chaque cycle.",
    when: "en place — https://github.com/Ggboykxz/black-hole-dashboard",
    source: "docs/DASHBOARD.md",
  });

  return steps;
}
