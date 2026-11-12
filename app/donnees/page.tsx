import { Card } from "@/components/ui";
import { getSnapshot } from "@/lib/snapshot";
import { int, pct } from "@/lib/format";

export const revalidate = 60;

export default async function DataPage() {
  const { snapshot } = await getSnapshot();
  const d = snapshot.data;

  return (
    <div className="space-y-5" data-bot-target="data">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          Les données
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          La provenance du corpus : combien de tokens, d&apos;où, avec quel
          SHA-256, et quelle part de raisonnement. Le fichier de validation
          est <strong className="text-ink">le même</strong> que pour
          <code className="mx-1 text-accent">bh-004</code> — c&apos;est ce qui
          rend la courbe comparable d&apos;un run à l&apos;autre.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Le corpus d'entraînement">
          <div className="num text-[24px] text-ink">
            {int(d.total_tokens)}
          </div>
          <div className="text-[11.5px] text-dim">tokens uint16</div>
          <div className="mt-3 space-y-1.5 text-[11.5px]">
            <div className="flex justify-between">
              <span className="text-dim">dont raisonnement</span>
              <span className="num text-accent">
                {int(d.reasoning_tokens)} ({pct(d.reasoning_share ?? 0, 2)})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">SHA-256</span>
              <span className="num text-faint">{d.sha256?.slice(0, 20)}…</span>
            </div>
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Le corpus raisonnement est rendu <strong>deux fois</strong> exprès
            : c&apos;est ainsi que la part CoT atteint 21,94 % au lieu de 12 %.
          </p>
        </Card>

        <Card title="Le fichier de validation">
          <div className="num text-[24px] text-ink">
            {int(d.val?.n_tokens)}
          </div>
          <div className="text-[11.5px] text-dim">
            tokens — identique à bh-004
          </div>
          <p className="mt-3 break-all font-mono text-[10px] text-faint">
            {d.val?.sha256}
          </p>
          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Toute la courbe benchmark repose sur ce hash : s&apos;il change,
            les points ne sont plus comparables.
          </p>
        </Card>

        <Card title="L&apos;audit de fuite (SFT)">
          <p className="text-[11.5px] leading-relaxed text-dim">
            Le découpage se fait sur les exemples <strong>uniques</strong>, la
            répétition du CoT n&apos;est appliquée qu&apos;au côté train. Les
            jeux <code className="text-accent">sft-v3</code> et{" "}
            <code className="text-accent">sft-v4</code> ont{" "}
            <strong className="text-good">0 exemple de validation présent dans
            l&apos;entraînement</strong> ; <code className="text-accent">
            sft-v2
            </code>{" "}
            en avait 306 sur 310 (98,7 %) — il ne sert plus qu&apos;à la
            reproductibilité de P2/P4.
          </p>
        </Card>
      </div>

      <Card
        title="Les parts du corpus"
        source="data/tokenized/train_v2.meta.json"
      >
        <table className="dt">
          <thead>
            <tr>
              <th>fichier</th>
              <th>part</th>
              <th className="text-right">tokens</th>
              <th className="text-right">octets</th>
              <th className="text-right">part du corpus</th>
            </tr>
          </thead>
          <tbody>
            {d.parts.map((p, i) => (
              <tr key={i}>
                <td className="num text-ink">{p.file}</td>
                <td className="text-dim">{p.label}</td>
                <td className="num text-right">{int(p.tokens)}</td>
                <td className="num text-right text-faint">{int(p.bytes)}</td>
                <td className="num text-right">
                  {pct((100 * p.tokens) / (d.total_tokens || 1), 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Les jeux d'instruction-tuning"
        source="data/sft*/meta.json — quatre jeux, non comparables entre eux"
      >
        <table className="dt">
          <thead>
            <tr>
              <th>jeu</th>
              <th className="text-right">train</th>
              <th className="text-right">val</th>
              <th className="text-right">tokens train</th>
              <th className="text-right">part CoT</th>
              <th className="text-right">×CoT</th>
              <th className="text-right">fuite</th>
            </tr>
          </thead>
          <tbody>
            {d.sft_sets.map((s) => (
              <tr key={s.name}>
                <td className="num text-ink">{s.name}</td>
                <td className="num text-right">{int(s.n_train)}</td>
                <td className="num text-right">{int(s.n_val)}</td>
                <td className="num text-right text-dim">{int(s.tokens_train)}</td>
                <td className="num text-right text-accent">
                  {s.cot_share !== null ? pct(s.cot_share, 2) : "—"}
                </td>
                <td className="num text-right text-faint">
                  {s.cot_repeat ?? "—"}
                </td>
                <td
                  className={`num text-right ${
                    s.leak === 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {s.leak === null ? "—" : s.leak}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          <code className="text-accent">sft-v3</code> est le jeu par défaut de
          tout nouveau fine-tune ; <code className="text-accent">sft-v4</code>{" "}
          (CoT ×4) est le jeu de l&apos;A/B <strong>P13</strong>, face au
          levier « perte » de <strong>P12</strong>.
        </p>
      </Card>
    </div>
  );
}
