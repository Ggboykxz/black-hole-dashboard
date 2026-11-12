import { Card } from "@/components/ui";
import Chart from "@/components/chart";
import { getSnapshot } from "@/lib/snapshot";

export const revalidate = 60;

const COLORS: Record<string, string> = {
  "bh-003": "#64708a",
  "bh-004": "#a78bfa",
  "bh-005": "#38bdf8",
  "bh-004-sft": "#fb923c",
  "bh-004-sft-replay": "#34d399",
};

export default async function ComparisonPage() {
  const { snapshot } = await getSnapshot();
  const byRun = (
    snapshot as unknown as {
      benchmarks_by_run: Record<
        string,
        { step: number; loss: number; ppl: number }[]
      >;
    }
  ).benchmarks_by_run;

  const runs = Object.entries(byRun).filter(([, pts]) => pts.length > 0);

  return (
    <div className="space-y-5" data-bot-target="comparison">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          La comparaison des runs
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Le même protocole (
          <code className="text-accent">val-25×8×1024-seed1234-fp16</code>),
          le même fichier de validation, le même tokenizer : c&apos;est la
          seule comparaison qui a du sens. <code className="text-accent">
          bh-004</code> est le run web ;{" "}
          <code className="text-accent">bh-005</code> ajoute 21,94 % de
          raisonnement et 50 000 steps.
        </p>
      </div>

      <Card
        title="Toutes les séries comparables"
        source="runs/benchmarks.jsonl — filtré sur comparable = true"
      >
        <Chart
          height={340}
          series={runs.map(([run, pts]) => ({
            label: run,
            color: COLORS[run] ?? "#64708a",
            points: pts.map((p) => ({ x: p.step, y: p.loss })),
            area: run === "bh-005",
          }))}
          xFormat="step"
          yFormat="loss3"
          hlines={[{ y: 3.9, label: "porte P5 : ≤ 3,90", color: "#fbbf24" }]}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>run</th>
                <th className="text-right">points</th>
                <th className="text-right">premier</th>
                <th className="text-right">dernier</th>
                <th className="text-right">gain total</th>
                <th className="text-right">Δ moyen / 500 steps</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(([run, pts]) => {
                const first = pts[0];
                const last = pts[pts.length - 1];
                const per500 =
                  pts.length > 1
                    ? ((last.loss - first.loss) /
                        ((last.step - first.step) / 500))
                    : 0;
                return (
                  <tr key={run}>
                    <td className="num" style={{ color: COLORS[run] ?? "#98a2b6" }}>
                      {run}
                    </td>
                    <td className="num text-right">{pts.length}</td>
                    <td className="num text-right">
                      {first.loss.toFixed(5)} @ {first.step}
                    </td>
                    <td className="num text-right">
                      {last.loss.toFixed(5)} @ {last.step}
                    </td>
                    <td
                      className={`num text-right ${
                        last.loss < first.loss ? "text-good" : "text-bad"
                      }`}
                    >
                      {last.loss - first.loss >= 0 ? "+" : "−"}
                      {Math.abs(last.loss - first.loss).toFixed(5)}
                    </td>
                    <td className="num text-right text-dim">
                      {per500 >= 0 ? "+" : "−"}
                      {Math.abs(per500).toFixed(5)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
          Le « gain total » compare le premier et le dernier point de chaque
          série : ce n&apos;est pas un « score », c&apos;est le déplacement de
          la courbe officielle sur la plage effectivement couverte par ce run.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Les checkpoints locaux" source="runs/bh-005/ckpt_step*.pt">
          <table className="dt">
            <thead>
              <tr>
                <th>fichier</th>
                <th className="text-right">step</th>
                <th className="text-right">taille</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.checkpoints.map((c) => (
                <tr key={c.name}>
                  <td className="num text-ink">{c.name}</td>
                  <td className="num text-right">
                    {c.step.toLocaleString("fr-FR")}
                  </td>
                  <td className="num text-right text-dim">{c.size_gb.toFixed(2)} Go</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 font-mono text-[10px] text-faint">
            poids + moments d&apos;Adam (fp32) : c&apos;est ce qui permet de
            reprendre *exactement* là où l&apos;entraînement s&apos;est arrêté.
          </p>
        </Card>

        <Card title="La série secondaire (raisonnement)" source="runs/reasoning_val_benchmarks.json">
          <Chart
            height={220}
            series={[
              {
                label: "raisonnement (in-domain)",
                color: "#a78bfa",
                points: snapshot.paired.map((p) => ({ x: p.step, y: p.reasoning })),
                area: true,
              },
            ]}
            xFormat="step"
            yFormat="loss3"
          />
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
            Même fenêtres que la série web, mais sur{" "}
            <code>data/reasoning/val.bin</code> — le domaine qui fournit 21,94 %
            du corpus. In-domain : ce n&apos;est pas un transfert.
          </p>
        </Card>
      </div>
    </div>
  );
}
