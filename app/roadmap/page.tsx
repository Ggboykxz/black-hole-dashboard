import { Card } from "@/components/ui";
import { getSnapshot } from "@/lib/snapshot";
import { buildRoadmap } from "@/lib/roadmap";

export const revalidate = 60;

const STATUS: Record<string, { label: string; color: string; dot: string }> = {
  done: { label: "fait", color: "text-good", dot: "bg-good" },
  active: { label: "en cours", color: "text-accent", dot: "bg-accent" },
  pending: { label: "à venir", color: "text-dim", dot: "bg-faint" },
  blocked: { label: "bloqué", color: "text-bad", dot: "bg-bad" },
};

export default async function RoadmapPage() {
  const { snapshot } = await getSnapshot();
  const steps = buildRoadmap(snapshot);

  const phases = [...new Set(steps.map((s) => s.phase))];

  return (
    <div className="space-y-5" data-bot-target="roadmap">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          La feuille de route
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Les prochaines étapes — de l&apos;entraînement à la publication —{" "}
          <strong className="text-ink">dérivées des artefacts</strong>, pas
          écrites à la main : le jalon d&apos;entraînement vient du log, les
          hypothèses ouvertes de <code className="text-accent">
            PREDICTIONS.md
          </code>
          , les mesures à faire des lacunes déclarées dans{" "}
          <code className="text-accent">METRICS.md</code>. Quand le run
          avance, la feuille avance avec lui.
        </p>
      </div>

      {phases.map((phase) => (
        <Card key={phase} title={phase}>
          <ol className="relative space-y-4 border-l border-line pl-5">
            {steps
              .filter((s) => s.phase === phase)
              .map((s) => {
                const st = STATUS[s.status];
                return (
                  <li key={s.id} className="relative">
                    <span
                      className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ${st.dot} ${
                        s.status === "active" ? "animate-pulse" : ""
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] text-ink">{s.title}</span>
                      <span className={`text-[10.5px] ${st.color}`}>
                        {st.label}
                        {s.when ? ` · ${s.when}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-dim">
                      {s.detail}
                    </p>
                    {s.progress !== null ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-[#12161e]">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-700"
                            style={{
                              width: `${Math.max(0, Math.min(100, s.progress * 100))}%`,
                            }}
                          />
                        </div>
                        <span className="num text-[10px] text-faint">
                          {(s.progress * 100).toFixed(0)} %
                        </span>
                      </div>
                    ) : null}
                    <p className="mt-1 font-mono text-[9.5px] text-faint">
                      source : {s.source}
                    </p>
                  </li>
                );
              })}
          </ol>
        </Card>
      ))}
    </div>
  );
}
