import { Card } from "@/components/ui";
import { getSnapshot } from "@/lib/snapshot";
import { when } from "@/lib/format";

export const revalidate = 60;

const TONE: Record<string, { badge: "good" | "bad" | "warn" | "muted"; label: string }> = {
  hit: { badge: "good", label: "tenue" },
  miss: { badge: "bad", label: "manquée" },
  pending: { badge: "warn", label: "en attente" },
  other: { badge: "muted", label: "—" },
};

export default async function PredictionsPage() {
  const { snapshot } = await getSnapshot();
  const s = snapshot;

  const order = ["P1", "P2", "P11", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P12", "P13", "P14"];
  const rows = [...s.predictions].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );

  return (
    <div className="space-y-5" data-bot-target="predictions">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          Les prédictions
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Écrites <em>avant</em> la mesure, jamais réécrites après : un miss
          reste un miss, avec la même visibilité qu&apos;un hit. La commande
          qui tranche chaque ligne est affichée — c&apos;est elle qui rend la
          ligne reproductible.
        </p>
      </div>

      <div className="grid gap-3">
        {rows.map((p) => {
          const tone = TONE[p.verdict] ?? TONE.other;
          return (
            <Card
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="num text-accent">{p.id}</span>
                  <span>{p.question}</span>
                </span>
              }
              right={
                <span
                  className={`rounded-full border px-2 py-[2px] text-[10.5px] ${
                    tone.badge === "good"
                      ? "border-good/40 text-good"
                      : tone.badge === "bad"
                        ? "border-bad/40 text-bad"
                        : tone.badge === "warn"
                          ? "border-warn/40 text-warn"
                          : "border-line text-faint"
                  }`}
                >
                  {tone.label}
                </span>
              }
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
                    la prédiction
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink">
                    {p.prediction}
                  </p>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-faint">
                    ce qui la tranche
                  </div>
                  <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-accent/90">
                    {p.settles_with}
                  </p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-faint">
                    l&apos;état
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-dim">
                    {p.state}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card
        title="Comment lire ces lignes"
        source="docs/PREDICTIONS.md — règles 6, 7 et 8 du registre des mesures"
      >
        <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-dim">
          <li>
            • Une prédiction est <strong className="text-ink">écrite avant</strong>{" "}
            la mesure ; un miss est enregistré comme un miss, jamais
            ré-expliqué.
          </li>
          <li>
            • Une porte se règle <strong className="text-ink">à son step</strong>{" "}
            : P5 est la mesure du step 16 000, pas le premier point sous
            3,90.
          </li>
          <li>
            • Un point intermédiaire est une <strong className="text-ink">preuve
            </strong> pour la ligne suivante, jamais le remplissage d&apos;une
            autre.
          </li>
        </ul>
      </Card>
    </div>
  );
}
