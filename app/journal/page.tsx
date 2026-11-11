import { Card } from "@/components/ui";
import Markdown from "@/components/markdown";
import { getSnapshot } from "@/lib/snapshot";

export const revalidate = 60;

export default async function JournalPage() {
  const { snapshot } = await getSnapshot();

  return (
    <div className="space-y-5" data-bot-target="journal">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          Le journal
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Chaque version, chaque défaut trouvé, chaque correction — avec la
          date et l&apos;artefact. C&apos;est le changelog complet du dépôt,
          rendu.
        </p>
      </div>

      <Card title="docs/CHANGELOG.md" source="docs/CHANGELOG.md">
        <div className="max-h-[80vh] overflow-y-auto pr-1">
          <Markdown source={snapshot.prose.changelog ?? ""} />
        </div>
      </Card>

      <Card title="docs/METRICS.md" source="docs/METRICS.md">
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <Markdown source={snapshot.prose.metrics ?? ""} />
        </div>
      </Card>
    </div>
  );
}
