import VariationsFeed from "@/components/variations-feed";
import { getSnapshot } from "@/lib/snapshot";

export const revalidate = 60;

export default async function VariationsPage() {
  const { snapshot } = await getSnapshot();

  return (
    <div className="space-y-5" data-bot-target="variations">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          La traque des variations
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Chaque chiffre du run, suivi mesure par mesure : valeur courante, dernier
          changement, écart sur une minute, minimum et maximum de la fenêtre,
          avec la précision exacte du producteur. Les échantillons sont
          persistés sur cet appareil — un rechargement ne remet pas la traque à
          zéro, et l&apos;âge du dernier signal est toujours recalculé, jamais
          maquillé.
        </p>
      </div>

      <div className="card p-4">
        <div className="grid gap-2 text-[11px] leading-relaxed text-dim sm:grid-cols-3">
          <div className="border-l border-line pl-2.5">
            <span className="text-ink">Ce qui est mesuré</span>
            <p className="mt-0.5 text-faint">
              Les valeurs de <code className="text-accent">/api/live</code> :
              log du trainer et <code className="text-accent">nvidia-smi</code>.
              Rien n&apos;est recalculé à partir d&apos;une autre source.
            </p>
          </div>
          <div className="border-l border-line pl-2.5">
            <span className="text-ink">Ce que « Δ » veut dire</span>
            <p className="mt-0.5 text-faint">
              L&apos;écart au dernier <em>changement réel</em>, pas au dernier
              rendu. La perte n&apos;est écrite que toutes les 10 steps
              (~26 s) : un Δ nul entre deux mesures est normal.
            </p>
          </div>
          <div className="border-l border-line pl-2.5">
            <span className="text-ink">Ce que la précision vaut</span>
            <p className="mt-0.5 text-faint">
              5 décimales pour la perte, notation scientifique pour le LR,
              0,1 °C pour la carte. On n&apos;affiche jamais un zéro de
              remplissage qui prétendrait à plus de précision que la mesure.
            </p>
          </div>
        </div>
      </div>

      <VariationsFeed
        run={snapshot.status.run}
        generatedAt={snapshot.status.generated_at}
      />
    </div>
  );
}
