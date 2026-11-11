import { Card } from "@/components/ui";
import Chart from "@/components/chart";
import { getSnapshot } from "@/lib/snapshot";
import { analyse } from "@/lib/analysis";

export const revalidate = 60;

const TONE: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-accent",
};

export default async function AnalysePage() {
  const { snapshot } = await getSnapshot();
  const insights = analyse(snapshot);

  // the official curve of every run — the comparison that matters
  const byRun: Record<string, { x: number; y: number }[]> = {};
  for (const b of snapshot.benchmarks) {
    const run = "bh-005";
    (byRun[run] ||= []).push({ x: b.step, y: b.loss });
  }

  return (
    <div className="space-y-5" data-bot-target="analysis">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          L&apos;analyse
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Ce que les artefacts <em>impliquent</em>, pas seulement ce qu&apos;ils
          contiennent : la pente, la volatilité, l&apos;extrapolation (dite
          comme telle), l&apos;écart aux portes, le budget de calcul, le bilan
          des prédictions. Chaque nombre dérivé affiche sa méthode et ses
          fichiers sources — une projection sans méthode est une rumeur à
          virgule.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {insights.map((i) => (
          <Card key={i.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
                  {i.title}
                </div>
                <div className={`num mt-1 text-[19px] leading-tight ${TONE[i.level]}`}>
                  {i.value}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-dim">
              {i.detail}
            </p>
            <p className="mt-2 font-mono text-[10px] text-faint">
              source : {i.source}
              {i.method ? ` · méthode : ${i.method}` : ""}
            </p>
          </Card>
        ))}
      </div>

      <Card
        title="La courbe officielle, tous runs confondus"
        source="runs/benchmarks.jsonl — même protocole, donc comparable"
      >
        <Chart
          height={320}
          series={[
            {
              label: "bh-005",
              color: "#38bdf8",
              points: byRun["bh-005"] ?? [],
              area: true,
            },
          ]}
          xFormat="step"
          yFormat="loss3"
          hlines={[
            { y: 3.9, label: "porte P5 : ≤ 3,90", color: "#fbbf24" },
            { y: 3.6, label: "porte P8 : ≤ 3,60", color: "#a78bfa" },
          ]}
        />
      </Card>
    </div>
  );
}
