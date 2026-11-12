import Link from "next/link";
import Chart from "@/components/chart";
import Bots from "@/components/bots";
import Hero from "@/components/hero";
import Swarm from "@/components/swarm";
import VariationsFeed from "@/components/variations-feed";
import { Card, Stat, Badge, Source } from "@/components/ui";
import { getSnapshot } from "@/lib/snapshot";
import { buildBots } from "@/lib/bots";
import { compact, delta, f2, f4, f5, hours, int, pct, step as fmtStep, when } from "@/lib/format";

export const revalidate = 60;

export default async function Home() {
  const { snapshot, source } = await getSnapshot();
  const s = snapshot;
  const st = s.status;
  const bench = s.benchmarks;
  const last = bench[bench.length - 1];
  const prev = bench[bench.length - 2];
  const p5 = s.predictions.find((p) => p.id === "P5");

  const series = [
    {
      label: "bench officiel (M3)",
      color: "#38bdf8",
      points: bench.map((b) => ({ x: b.step, y: b.loss })),
      area: true,
    },
  ];
  const paired = [
    {
      label: "web (protocole officiel)",
      color: "#38bdf8",
      points: s.paired.map((p) => ({ x: p.step, y: p.web })),
    },
    {
      label: "raisonnement (M5, in-domain)",
      color: "#a78bfa",
      points: s.paired.map((p) => ({ x: p.step, y: p.reasoning })),
    },
  ];

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------- hero */}
      <Hero snapshot={s} />

      {/* ------------------------------------------------ live variations */}
      <VariationsFeed run={st.run} generatedAt={st.generated_at} compact />

      {/* ---------------------------------------------------------- swarm */}
      <Card
        title="Les avatars en direct"
        source="états calculés depuis les artefacts, rafraîchis avec le feed partagé (1 s)"
        botTarget="swarm"
      >
        <Swarm bots={buildBots(s, null)} height={320} />
      </Card>

      {/* ---------------------------------------------------------- bots */}
      <Card
        title="L'équipe — un bot par acteur du système"
        source="cliquez un bot pour le détail et l'action à mener"
        botTarget="bots"
      >
        <Bots snapshot={s} />
      </Card>

      {/* ---------------------------------------------------------- charts */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="La série officielle (M3)"
          source="runs/benchmarks.jsonl — val-25×8×1024-seed1234-fp16"
          botTarget="chart-bench"
          right={
            last ? (
              <Badge tone={last.delta !== null && last.delta < 0 ? "good" : "warn"}>
                {delta(last.delta)} vs {fmtStep(last.step - 500)}
              </Badge>
            ) : null
          }
        >
          <Chart
            series={series}
            height={280}
            yFormat="loss3"
            xFormat="step"
            hlines={[{ y: 3.9, label: "porte P5 : ≤ 3,90", color: "#fbbf24" }]}
            markers={[{ x: 16000, label: "P5", color: "#fb7185" }]}
          />
          <Source>
            Seule série comparable entre runs. Le point de 16 000 remplit la
            ligne P5 (3,90223 &gt; 3,90 → miss) ; les points suivants sont des
            preuves pour la ligne suivante, pas pour celle-ci.
          </Source>
        </Card>

        <Card
          title="Web vs raisonnement — la même fenêtre"
          source="runs/benchmarks.jsonl + runs/reasoning_val_benchmarks.json"
          botTarget="chart-paired"
        >
          <Chart
            series={paired}
            height={280}
            yFormat="loss3"
            xFormat="step"
          />
          <Source>
            La courbe violette est <strong>in-domain</strong> : 21,94 % du
            corpus est du NuminaMath-CoT. Une baisse rapide là-bas est
            compatible avec l&apos;apprentissage de la *forme* des dérivations —
            ce n&apos;est pas une mesure de transfert.
          </Source>
        </Card>
      </div>

      {/* ---------------------------------------------------------- capability */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="Capacité — la seule métrique d'exactitude"
          source="runs/reasoning_eval.json (n = 1 319 pour le test complet)"
          botTarget="capability"
        >
          <table className="dt">
            <thead>
              <tr>
                <th>mesure</th>
                <th className="text-right">n</th>
                <th className="text-right">exact</th>
                <th className="text-right">accuracy</th>
                <th className="text-right">marqueur ####</th>
                <th>quand</th>
              </tr>
            </thead>
            <tbody>
              {s.gsm8k.map((g, i) => (
                <tr key={i}>
                  <td className="text-ink">{g.label ?? "—"}</td>
                  <td className="num text-right">{int(g.n)}</td>
                  <td className="num text-right">
                    {int(g.n_correct)}/{int(g.n)}
                  </td>
                  <td
                    className={`num text-right ${
                      (g.accuracy ?? 0) > 0 ? "text-good" : "text-dim"
                    }`}
                  >
                    {g.accuracy !== null ? pct(g.accuracy * 100, 2) : "—"}
                  </td>
                  <td className="num text-right text-warn">
                    {g.marker_rate !== null ? pct(g.marker_rate * 100, 1) : "—"}
                  </td>
                  <td className="num text-faint">{when(g.measured_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Source>
            Le marqueur `####` à 0 % signifie que le modèle n&apos;a jamais
            produit la convention : les bonnes réponses viennent du repli
            « dernier nombre ». L&apos;extracteur v2 (2026-11-11) gère les
            séparateurs de milliers — les résultats antérieurs sont des
            minorants (voir P1/P11).
          </Source>
        </Card>

        <div className="space-y-4">
          <Card title="Les trous assumés" source="docs/METRICS.md §5" botTarget="gaps">
            <ul className="space-y-2 text-[11.5px] leading-relaxed text-dim">
              {s.gaps.map((g, i) => (
                <li key={i} className="border-l border-line pl-2.5">
                  <span className="text-ink">{g.gap}</span>
                  <div className="text-faint">{g.consequence}</div>
                  <div className="text-accent/80">→ {g.next}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Vérification documentaire"
            source="runs/audit_status.json"
            botTarget="audit"
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  s.audit && s.audit.ok === s.audit.total
                    ? "bg-good"
                    : "bg-warn"
                }`}
              />
              <span className="num text-[15px] text-ink">
                {s.audit ? `${s.audit.ok}/${s.audit.total}` : "—"}
              </span>
              <span className="text-[11px] text-dim">
                contrôles documentaires
              </span>
            </div>
            <Source>
              L&apos;audit compare la documentation aux artefacts à chaque cycle du
              keepalive : dernier benchmark affiché, verdict P5, bloc du
              registre, extracteur GSM8K, fichiers cités, liens, pointeurs LFS.
            </Source>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/live" className="chip hover:border-accent/40 hover:text-accent">
          ◉ voir le direct
        </Link>
        <Link href="/metriques" className="chip hover:border-accent/40 hover:text-accent">
          ∑ le registre des mesures
        </Link>
        <Link href="/predictions" className="chip hover:border-accent/40 hover:text-accent">
          ◇ les prédictions
        </Link>
        <Link href="/runbook" className="chip hover:border-accent/40 hover:text-accent">
          ⚙ le runbook
        </Link>
      </div>
    </div>
  );
}
