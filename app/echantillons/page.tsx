import { Card } from "@/components/ui";
import Markdown from "@/components/markdown";
import { getSnapshot } from "@/lib/snapshot";

export const revalidate = 60;

export default async function SamplesPage() {
  const { snapshot } = await getSnapshot();
  const samples = snapshot.prose.samples ?? "";

  return (
    <div className="space-y-5" data-bot-target="samples">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          Les échantillons
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Quatre prompts figés, décodage glouton, CPU. C&apos;est{" "}
          <strong className="text-ink">qualitatif</strong> : jamais une
          métrique, jamais un score. On regarde ce que le modèle écrit pour
          juger s&apos;il reste dans le gabarit — pas pour mesurer quoi que ce
          soit.
        </p>
      </div>

      <Card
        title="runs/SAMPLES.md"
        source="scripts/sample_progress.py — archivé aussi dans runs/samples_progress.jsonl"
      >
        <Markdown source={samples} />
      </Card>
    </div>
  );
}
