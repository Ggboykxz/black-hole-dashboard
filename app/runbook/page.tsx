import { Card } from "@/components/ui";
import Markdown from "@/components/markdown";
import { getSnapshot } from "@/lib/snapshot";

export const revalidate = 60;

export default async function RunbookPage() {
  const { snapshot } = await getSnapshot();

  return (
    <div className="space-y-5" data-bot-target="runbook">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          Le runbook
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Les règles d&apos;or, la procédure de reprise et les pièges déjà
          rencontrés — rendus depuis <code className="text-accent">
            AGENTS.md
          </code>{" "}
          et <code className="text-accent">WHILE_RUNNING.md</code>, pour qu&apos;une
          session qui repart ailleurs n&apos;ait pas à les redécouvrir.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="AGENTS.md — les règles d'or" source="AGENTS.md">
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <Markdown source={snapshot.prose.agents ?? ""} />
          </div>
        </Card>
        <Card
          title="WHILE_RUNNING.md — pendant que ça tourne"
          source="runs/bh-005/WHILE_RUNNING.md"
        >
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <Markdown source={snapshot.prose.while_running ?? ""} />
          </div>
        </Card>
      </div>

      <Card title="La procédure de reprise" source="docs/RECOVERY.md">
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <Markdown source={snapshot.prose.recovery ?? ""} />
        </div>
      </Card>
    </div>
  );
}
