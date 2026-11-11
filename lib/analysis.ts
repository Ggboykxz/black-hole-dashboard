import type { Snapshot } from "./types";

/**
 * The analysis layer.
 *
 * The dashboard shows the artefacts; this module *reads* them and derives
 * what they imply — the slope of the curve, its volatility, where the run
 * would land if the current trend held, how many steps separate it from a
 * gate, how far the Chinchilla budget is from its target.
 *
 * Every derived number carries the rule that produced it, and every
 * extrapolation says out loud that it is an extrapolation. A derived number
 * without its method is a rumour with a decimal point.
 */

export interface Insight {
  id: string;
  title: string;
  value: string;
  detail: string;
  level: "good" | "warn" | "bad" | "info";
  /** the files the derivation read */
  source: string;
  /** the method, in one line */
  method?: string;
}

function slopePer(points: { x: number; y: number }[], per = 500): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (!den) return 0;
  return ((num / den) * per);      // y per `per` units of x
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

const f = (x: number, d = 5) => x.toFixed(d).replace(".", ",");
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d).replace(".", ",")} %`;

export function analyse(snapshot: Snapshot): Insight[] {
  const out: Insight[] = [];
  const bench = snapshot.benchmarks;
  const paired = snapshot.paired;
  const st = snapshot.status;
  const maxSteps = st.max_steps || 58000;

  // ---------------------------------------------------------- 1. the slope
  const last = bench[bench.length - 1];
  const recent = bench.slice(-4);
  const all = bench.slice(-10);
  const slope4 = slopePer(recent.map((b) => ({ x: b.step, y: b.loss })));
  const slope10 = slopePer(all.map((b) => ({ x: b.step, y: b.loss })));
  const deltas = bench.slice(-10).map((b) => b.delta ?? 0).filter((d) => d !== 0);
  const vol = stdev(deltas);

  out.push({
    id: "slope",
    title: "Pente de la série officielle",
    value: `${slope4 >= 0 ? "+" : ""}${f(slope4, 5)} / 500 steps`,
    detail:
      `Sur les 4 derniers points : ${f(slope4, 5)} par 500 steps ; sur les 10 derniers : ${f(
        slope10,
        5,
      )}. Un écart entre les deux signifie que la tendance change, pas que la courbe est fausse.`,
    level: slope4 < -0.001 ? "good" : slope4 > 0.0005 ? "warn" : "info",
    source: "runs/benchmarks.jsonl",
    method: "régression linéaire sur les points (x = step, y = perte)",
  });

  // ---------------------------------------------------------- 2. volatility
  out.push({
    id: "volatility",
    title: "Volatilité des derniers intervalles",
    value: `± ${f(vol, 5)} nats`,
    detail:
      "Écart-type des Δ entre points consécutifs (10 derniers). C'est la résolution de la mesure : une variation plus petite que ce bruit n'est pas une tendance.",
    level: vol > 0.004 ? "warn" : "info",
    source: "runs/benchmarks.jsonl",
    method: "écart-type des Δ successifs",
  });

  // ---------------------------------------------------------- 3. projection
  if (last && slope4 < 0) {
    const stepsLeft = maxSteps - last.step;
    const projected = last.loss + (slope4 * stepsLeft) / 500;
    const gate = 3.6;
    const stepsToGate = Math.ceil(((last.loss - gate) / slope4) * 500);
    out.push({
      id: "projection",
      title: "Projection (extrapolation, pas une promesse)",
      value: `${f(projected, 4)} au step ${maxSteps.toLocaleString("fr-FR")}`,
      detail:
        `Piste linéaire depuis le dernier point (${f(last.loss, 5)} @ ${last.step}) à la pente de ${f(
          slope4,
          5,
        )}/500 steps. Si la tendance se cassait — et une projection de 40 000 steps est par nature fragile — le résultat réel peut être très différent. La porte P8 (≤ 3,60) serait atteinte à ~${stepsToGate.toLocaleString(
          "fr-FR",
        )} steps de plus${stepsToGate > stepsLeft ? " — soit **après** la fin du run" : ""}.`,
      level:
        projected <= gate ? "good" : stepsToGate <= stepsLeft ? "warn" : "bad",
      source: "runs/benchmarks.jsonl + docs/PREDICTIONS.md (P8)",
      method: "extrapolation linéaire à pente constante",
    });
  }

  // ---------------------------------------------------------- 4. the plateau
  const ups = bench.slice(-6).filter((b) => (b.delta ?? 0) > 0).length;
  out.push({
    id: "plateau",
    title: "La série oscille-t-elle ?",
    value: `${ups} hausse(s) sur les 6 derniers intervalles`,
    detail:
      ups >= 3
        ? "La courbe n'est plus monotone : elle oscille autour d'un palier. Un palier n'est pas une baisse ratée, c'est un régime — et il faut le dire plutôt que de lisser."
        : ups > 0
          ? "Quelques hausses isolées dans un trend baissier : bruit de mesure, pas un retournement."
          : "Baisses régulières sur les 6 derniers intervalles.",
    level: ups >= 3 ? "warn" : "good",
    source: "runs/benchmarks.jsonl",
  });

  // ---------------------------------------------------------- 5. web vs reasoning
  if (paired.length >= 3) {
    const w = slopePer(paired.map((p) => ({ x: p.step, y: p.web })));
    const r = slopePer(paired.map((p) => ({ x: p.step, y: p.reasoning })));
    const wRel = w / paired[0].web;
    const rRel = r / paired[0].reasoning;
    out.push({
      id: "web-vs-reasoning",
      title: "Web vs raisonnement",
      value: `${(rRel / (wRel || 1e-9)).toFixed(1)}× plus rapide`,
      detail:
        `Sur la même fenêtre : web ${pct(wRel)} par 500 steps, raisonnement ${pct(
          rRel,
        )}. Attention : la série « raisonnement » est **in-domain** (21,94 % du corpus est du NuminaMath-CoT) — elle mesure l'apprentissage de la forme des dérivations, pas un transfert.`,
      level: "info",
      source: "runs/benchmarks.jsonl + runs/reasoning_val_benchmarks.json",
      method: "pente relative de chaque série sur les mêmes points",
    });
  }

  // ---------------------------------------------------------- 6. Chinchilla
  const params = 100_092_672;
  const target = 20 * params;
  const seen = st.tokens_seen ?? 0;
  out.push({
    id: "chinchilla",
    title: "Budget de calcul (Chinchilla)",
    value: `${pct(seen / target, 1)} de l'objectif`,
    detail:
      `${(seen / 1e9).toFixed(2).replace(".", ",")} Md tokens vus sur ${(
        target / 1e9
      )
        .toFixed(2)
        .replace(".", ",")} Md visés (20 × ${(
        params / 1e6
      )
        .toFixed(1)
        .replace(".", ",")} M paramètres). L'écart est **voulu** : le run finit ~5 % sous l'objectif pour garder 22 % de raisonnement dans le mélange.`,
    level: seen / target > 0.8 ? "good" : "warn",
    source: "log.jsonl + docs/PREDICTIONS.md (D2)",
    method: "tokens vus ÷ (20 × paramètres)",
  });

  // ---------------------------------------------------------- 7. the pace
  const pace = st.pace_s_per_step ?? 0;
  const etaH = st.eta_h ?? 0;
  out.push({
    id: "pace",
    title: "Cadence et coût du reliquat",
    value: `${pace.toFixed(2).replace(".", ",")} s/step · ${etaH.toFixed(1).replace(".", ",")} h`,
    detail:
      `Sur la T4 bridée par la puissance (≈ 65 W sur 70 W), le débit soutenu est ~12,9 k tok/s. Les ${(
        (maxSteps - st.step) * st.tokens_per_step
      ).toLocaleString("fr-FR")} tokens restants coûtent donc ~${etaH.toFixed(1).replace(
        ".",
        ",",
      )} h de carte — étalées sur plusieurs sessions Colab.`,
    level: "info",
    source: "runs/bh-005/log.jsonl",
    method: "moyenne des 40 dernières lignes × tokens/step",
  });

  // ---------------------------------------------------------- 8. the checkpoints
  const ck = snapshot.checkpoints;
  if (ck.length) {
    const newest = ck[ck.length - 1];
    out.push({
      id: "checkpoints",
      title: "Points de reprise",
      value: `${ck.length} en local · ${newest.name}`,
      detail:
        "Le run en garde 2 checkpoints en local et le Hub en garde 2 aussi (élagage). La garantie de reprise est `save_every = 500` steps ≈ 18 min de T4 : c'est elle, pas un handler de signal, qui borne la perte d'une session morte.",
      level: "info",
      source: "runs/bh-005/ckpt_step*.pt + configs/train-100m-bh005.json",
    });
  }

  // ---------------------------------------------------------- 9. the gaps
  if (snapshot.gaps.length) {
    out.push({
      id: "gaps",
      title: "Ce qui n'est pas mesuré",
      value: `${snapshot.gaps.length} lacune(s) déclarée(s)`,
      detail: snapshot.gaps.map((g) => g.gap).join(" · "),
      level: "warn",
      source: "docs/METRICS.md §5",
    });
  }

  // ---------------------------------------------------------- 10. the predictions
  const hits = snapshot.predictions.filter((p) => p.verdict === "hit").length;
  const misses = snapshot.predictions.filter((p) => p.verdict === "miss").length;
  const pending = snapshot.predictions.filter((p) => p.verdict === "pending").length;
  out.push({
    id: "predictions",
    title: "Le bilan des prédictions",
    value: `${hits} tenues · ${misses} manquées · ${pending} en attente`,
    detail:
      "Les prédictions sont écrites avant la mesure et ne sont jamais réécrites : le taux de hits n'est pas un score, c'est un inventaire d'hypothèses testées.",
    level: "info",
    source: "docs/PREDICTIONS.md",
  });

  return out;
}
