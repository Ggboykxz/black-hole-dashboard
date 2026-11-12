import { Card } from "@/components/ui";
import Chart from "@/components/chart";
import LivePanel from "@/components/live";
import Swarm from "@/components/swarm";
import Assistant from "@/components/assistant";
import { getSnapshot } from "@/lib/snapshot";
import { buildBots } from "@/lib/bots";
import { f5, when } from "@/lib/format";

export const revalidate = 60;

export default async function LivePage() {
  const { snapshot } = await getSnapshot();
  const s = snapshot;

  const events = (s as unknown as { events?: { at: string; kind: string; title: string; detail: string }[] })
    .events ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-ink">
            Le direct
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-dim">
            La courbe grandit pendant que le trainer écrit. En mode local,
            l&apos;API lit <code className="text-accent">log.jsonl</code> à
            chaque requête ; en mode Vercel, elle suit le heartbeat publié
            toutes les 30 s. Le panneau de santé au-dessus dit ce qui se
            passe — et quoi faire si la session s&apos;arrête.
          </p>
        </div>
      </div>

      <Card
        title="Les avatars en direct"
        source="un par acteur du système — déplace-les, clique-les"
      >
        <Swarm bots={buildBots(s, null)} height={300} />
      </Card>

      {/* les études Bencho ne vivent plus ici : le dock est la nav mobile,
          le bouton pause commande le direct, la pile de toasts est
          flottante au niveau du site. Le pied de page ne porte plus que la
          provenance des artefacts — pas de décoration sans fonction. */}

      <LivePanel
        initial={s.series.train.map((p) => ({ x: p.step, y: p.loss }))}
        initialVal={s.series.val.map((p) => ({ x: p.step, y: p.loss }))}
        run={s.status.run}
        maxSteps={s.status.max_steps}
        generatedAt={s.status.generated_at}
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card
          title="Ce qui s'ajoute en direct"
          source="checkpoints écrits, mesures officielles, échantillons générés"
        >
          <ul className="space-y-2">
            {events.slice(0, 14).map((e, i) => (
              <li
                key={i}
                className="flex gap-3 border-l border-line pl-3 text-[11.5px] leading-relaxed"
              >
                <span className="num w-[92px] shrink-0 text-faint">
                  {when(e.at)}
                </span>
                <span className="min-w-0">
                  <span
                    className={
                      e.kind === "mesure"
                        ? "text-accent"
                        : e.kind === "checkpoint"
                          ? "text-good"
                          : e.kind === "échantillon"
                            ? "text-warn"
                            : "text-dim"
                    }
                  >
                    {e.title}
                  </span>
                  <span className="block text-faint">{e.detail}</span>
                </span>
              </li>
            ))}
            {!events.length ? (
              <li className="text-[11.5px] text-faint">aucun événement listé</li>
            ) : null}
          </ul>
        </Card>

        <Card
          title="Assistant du run"
          source="répond uniquement à partir des artefacts — jamais d'invention"
          className="flex min-h-[420px] flex-col"
        >
          <div className="flex h-[380px] flex-col">
            <Assistant snapshot={s} live={null} />
          </div>
        </Card>
      </div>

      <Card
        title="Les dernières mesures officielles"
        source="runs/benchmarks.jsonl — le protocole fixe, la seule série comparable"
      >
        <div className="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>step</th>
                <th className="text-right">perte</th>
                <th className="text-right">ppl</th>
                <th className="text-right">Δ</th>
                <th className="text-right">mesurée</th>
                <th>protocole</th>
              </tr>
            </thead>
            <tbody>
              {[...s.benchmarks].reverse().slice(0, 10).map((b) => (
                <tr key={b.step}>
                  <td className="num text-ink">{b.step.toLocaleString("fr-FR")}</td>
                  <td className="num text-right text-accent">{f5(b.loss)}</td>
                  <td className="num text-right text-dim">{b.ppl.toFixed(2)}</td>
                  <td
                    className={`num text-right ${
                      b.delta !== null && b.delta < 0 ? "text-good" : "text-warn"
                    }`}
                  >
                    {b.delta !== null ? `${b.delta >= 0 ? "+" : ""}${b.delta.toFixed(5)}` : "—"}
                  </td>
                  <td className="num text-right text-faint">{when(b.measured_at)}</td>
                  <td className="num text-faint">val-25×8×1024-seed1234-fp16</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
