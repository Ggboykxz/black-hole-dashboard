import { Card } from "@/components/ui";
import Chart from "@/components/chart";
import { getSnapshot } from "@/lib/snapshot";
import { f5, int, pct, step as fmtStep, when } from "@/lib/format";

export const revalidate = 60;

export default async function MetricsPage() {
  const { snapshot } = await getSnapshot();
  const s = snapshot;
  const ext = s.extractor as
    | { n?: number; extraction_matches_gold?: number; fallback_rate?: number }
    | null;

  return (
    <div className="space-y-5" data-bot-target="metrics">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          Le registre des mesures
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Chaque métrique publiée a une définition, un producteur unique, un
          artefact, un step et une classe de comparabilité — et ce qu&apos;elle
          <em> ne</em> dit pas. C&apos;est la même table que
          <code className="mx-1 text-accent">docs/METRICS.md</code>, rendue.
        </p>
      </div>

      <Card
        title="Registre M1–M14"
        source="docs/METRICS.md §2 — généré par scripts/metrics_ledger.py"
      >
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>id</th>
                <th>métrique</th>
                <th>définition</th>
                <th>producteur</th>
                <th>artefact</th>
                <th>comparabilité</th>
              </tr>
            </thead>
            <tbody>
              {s.registry.map((m) => (
                <tr key={m.id}>
                  <td className="num font-medium text-accent">{m.id}</td>
                  <td className="text-ink">{m.metric}</td>
                  <td className="max-w-[320px]">{m.definition}</td>
                  <td className="num text-faint">{m.producer}</td>
                  <td className="num text-faint">{m.artefact}</td>
                  <td className="max-w-[280px]">{m.comparability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card
          title="La série officielle, point par point"
          source="runs/benchmarks.jsonl — val-25×8×1024-seed1234-fp16"
        >
          <Chart
            height={280}
            series={[
              {
                label: "bench officiel (M3)",
                color: "#38bdf8",
                points: s.benchmarks.map((b) => ({ x: b.step, y: b.loss })),
                area: true,
              },
            ]}
            xFormat="step"
            yFormat="loss3"
            hlines={[{ y: 3.9, label: "porte P5 ≤ 3,90", color: "#fbbf24" }]}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>step</th>
                  <th className="text-right">M3</th>
                  <th className="text-right">M4 (ppl)</th>
                  <th className="text-right">Δ</th>
                  <th className="text-right">mesurée</th>
                </tr>
              </thead>
              <tbody>
                {[...s.benchmarks].reverse().map((b) => (
                  <tr key={b.step}>
                    <td className="num">{fmtStep(b.step)}</td>
                    <td className="num text-right text-accent">{f5(b.loss)}</td>
                    <td className="num text-right text-dim">{b.ppl.toFixed(2)}</td>
                    <td
                      className={`num text-right ${
                        b.delta !== null && b.delta < 0 ? "text-good" : "text-warn"
                      }`}
                    >
                      {b.delta !== null
                        ? `${b.delta >= 0 ? "+" : ""}${b.delta.toFixed(5)}`
                        : "—"}
                    </td>
                    <td className="num text-right text-faint">{when(b.measured_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card
            title="M6 — la seule métrique d'exactitude"
            source="runs/reasoning_eval.json + runs/gsm8k_extraction.json"
          >
            <table className="dt">
              <tbody>
                {s.gsm8k.map((g, i) => (
                  <tr key={i}>
                    <td className="text-ink">{g.label ?? "—"}</td>
                    <td className="num text-right">
                      {g.n_correct}/{int(g.n)}
                    </td>
                    <td className="num text-right text-accent">
                      {g.accuracy !== null ? pct(g.accuracy * 100, 2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ext ? (
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
                extracteur : {ext.extraction_matches_gold}/{ext.n} références
                rend leur or · repli sans marqueur{" "}
                {ext.fallback_rate !== undefined
                  ? pct(ext.fallback_rate * 100, 2)
                  : "—"}
              </p>
            ) : null}
          </Card>

          <Card title="M12 — la dérive des poids" source="runs/soup_bh-005.json">
            {s.drift ? (
              <div className="space-y-1.5 text-[11.5px]">
                <div className="flex justify-between">
                  <span className="text-dim">fenêtre</span>
                  <span className="num text-ink">
                    {JSON.stringify((s.drift as { window?: number[] }).window)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">‖Δw‖/‖w‖</span>
                  <span className="num text-ink">
                    {pct(
                      100 *
                        ((s.drift as { end_to_end_drift?: number }).end_to_end_drift ??
                          0),
                      4,
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dim">checkpoints</span>
                  <span className="num text-ink">
                    {String((s.drift as { n_checkpoints?: number }).n_checkpoints ?? "—")}
                  </span>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                  Un bassin plat n&apos;est pas un bon modèle : c&apos;est une
                  mesure de déplacement, pas de qualité.
                </p>
              </div>
            ) : (
              <p className="text-[11.5px] text-faint">aucune mesure de dérive</p>
            )}
          </Card>

          <Card title="M13 — transfert hors domaine" source="runs/mceval.json">
            <p className="text-[11.5px] leading-relaxed text-dim">
              {s.mceval
                ? "mesuré — voir le fichier"
                : "Absent : les cinq jeux sont en cache et le harnais est validé, mais la mesure complète demande le GPU."}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
