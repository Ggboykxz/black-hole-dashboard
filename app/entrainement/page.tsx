import { Card } from "@/components/ui";
import Chart from "@/components/chart";
import { getSnapshot } from "@/lib/snapshot";
import { f2, f4, int, pct, step as fmtStep } from "@/lib/format";

export const revalidate = 60;

export default async function TrainingPage() {
  const { snapshot } = await getSnapshot();
  const s = snapshot;
  const r = (s as unknown as { recipe?: Record<string, unknown> }).recipe ?? {};

  const train = s.series.train.map((p) => ({ x: p.step, y: p.loss }));
  const val = s.series.val.map((p) => ({ x: p.step, y: p.loss }));
  const lr = s.series.lr.map((p) => ({ x: p.step, y: p.lr }));
  const grad = s.series.grad.map((p) => ({ x: p.step, y: p.grad }));

  const origin = s.status.origin_step ?? 8000;

  return (
    <div className="space-y-5" data-bot-target="training">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          L&apos;entraînement
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          La recette, la perte, le schedule, la cadence. Chaque chiffre porte
          son step et son fichier ; la perte du run (20 batches, sampler du
          run) et la mesure officielle (25 × 8 × 1 024, graine 1234) sont deux
          grandeurs différentes — le dashboard ne les mélange jamais.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card
          title="Perte d'entraînement et évaluation du run"
          source="runs/bh-005/log.jsonl — une ligne / 10 steps, une éval / 250"
        >
          <Chart
            height={320}
            series={[
              { label: "train (fenêtre)", color: "#38bdf8", points: train, area: true },
              { label: "val du run (20 batches)", color: "#a78bfa", points: val },
            ]}
            xFormat="step"
            yFormat="loss3"
          />
          <p className="mt-2 font-mono text-[10px] text-faint">
            la courbe violette est un signal de tendance (bruit ≈ ±0,03 nats) ;
            la série comparable est <span className="text-accent">bench</span>.
          </p>
        </Card>

        <Card title="La recette du run" source="configs/train-100m-bh005.json">
          <table className="dt">
            <tbody>
              {(
                [
                ["données", r.train_data],
                ["validation", r.val_data],
                [
                  "batch",
                  `${r.batch_size} × ${r.grad_accum_steps} × ${r.seq_len} = ${int(
                    r.tokens_per_step as number,
                  )} tokens/step`,
                ],
                ["horizon", `${int(r.max_steps as number)} steps`],
                [
                  "LR",
                  `${r.lr} → ${r.min_lr} (cosine, warmup ${r.warmup_steps})`,
                ],
                [
                  "optimiseur",
                  `AdamW β=(${r.beta1}, ${r.beta2}) wd=${r.weight_decay} clip=${r.grad_clip}`,
                ],
                ["précision", `${r.dtype} autocast sur ${r.device}`],
                ["graine", String(r.seed ?? "—")],
                [
                  "évaluations",
                  `toutes les ${r.eval_every} steps, ${r.eval_iters} batches`,
                ],
                ["checkpoints", `tous les ${r.save_every} steps`],
                ["repris depuis", r.resumed_from],
                ["matériel", r.hardware],
              ] as [string, unknown][]).map(([k, v]) => (
                <tr key={String(k)}>
                  <td className="w-[38%] text-faint">{k}</td>
                  <td className="num text-ink">{String(v ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Schedule du learning rate"
          source="blackhole/schedule.py — cosinus, une seule implémentation"
        >
          <Chart
            height={220}
            series={[{ label: "lr", color: "#34d399", points: lr, area: true }]}
            xFormat="step"
            yFormat="sci"
            markers={[{ x: origin, label: "couture (step 8 000)", color: "#fbbf24" }]}
          />
        </Card>

        <Card title="Norme du gradient" source="runs/bh-005/log.jsonl — grad_norm">
          <Chart
            height={220}
            series={[{ label: "grad norm", color: "#fb7185", points: grad }]}
            xFormat="step"
            yFormat="loss2"
          />
          <p className="mt-2 font-mono text-[10px] text-faint">
            clip à {f2(r.grad_clip as number)} — au-dessus, le pas est tronqué.
          </p>
        </Card>

        <Card title="Ce qui a été consommé" source="log.jsonl + config">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
                tokens vus par les poids
              </div>
              <div className="num text-[20px] text-ink">
                {int(s.status.tokens_seen)}
              </div>
              <div className="text-[11px] text-dim">
                step × {int(s.status.tokens_per_step)} — la lignée entière
                (bh-003 → bh-005)
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
                consommés par ce run
              </div>
              <div className="num text-[20px] text-accent">
                {int(s.status.tokens_this_run)}
              </div>
              <div className="text-[11px] text-dim">
                (step − {fmtStep(s.status.origin_step)}) × {int(s.status.tokens_per_step)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-line bg-panel2/50 px-2.5 py-2">
                <div className="text-faint">cadence</div>
                <div className="num text-ink">{f2(s.status.pace_s_per_step)} s/step</div>
              </div>
              <div className="rounded-lg border border-line bg-panel2/50 px-2.5 py-2">
                <div className="text-faint">débit</div>
                <div className="num text-ink">{int(s.status.tokens_per_s)} tok/s</div>
              </div>
              <div className="rounded-lg border border-line bg-panel2/50 px-2.5 py-2">
                <div className="text-faint">évaluations</div>
                <div className="num text-ink">{s.status.n_evals}</div>
              </div>
              <div className="rounded-lg border border-line bg-panel2/50 px-2.5 py-2">
                <div className="text-faint">meilleure val</div>
                <div className="num text-ink">
                  {s.status.val_best ? f4(s.status.val_best.loss) : "—"}
                </div>
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed text-faint">
              Chinchilla pour 100 M paramètres : ≈ 2,0 Md tokens. Ce run vise
              ≈ 1,91 Md — {pct(s.data.reasoning_share ?? 0, 2)} de raisonnement
              inclus.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
