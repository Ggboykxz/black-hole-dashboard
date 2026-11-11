"use client";

import { useEffect, useRef, useState } from "react";
import type { Live, Snapshot } from "@/lib/types";

interface Props {
  snapshot: Snapshot;
  live: Live | null;
}

interface Msg {
  who: "user" | "bot";
  text: string;
  at: string;
}

const EXAMPLES = [
  "Où en est le run ?",
  "Quelle est la perte officielle ?",
  "Combien de temps reste-t-il ?",
  "Qu'a decided P5 ?",
  "Quelle est la vitesse et la température GPU ?",
  "Quels sont les trous encore ouverts ?",
  "Qu'est-ce qui a été mesuré en GSM8K ?",
];

/**
 * A rule-based assistant over the artefacts.
 *
 * It is deliberately *not* an LLM: it answers only from the snapshot and
 * the heartbeat, it says so when a question is outside that set, and every
 * answer carries the file it came from. A dashboard that invents numbers is
 * worse than a dashboard without chat.
 */
export default function Assistant({ snapshot, live }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const answer = (q: string): string => {
    const s = snapshot;
    const l = live;
    const step = l?.step ?? s.status.step;
    const t = (x: string) => x.toLowerCase();

    if (/p5|porte|gate/.test(t(q))) {
      const p5 = s.predictions.find((p) => p.id === "P5");
      const pt = s.benchmarks.find((b) => b.step === 16000);
      return p5
        ? `P5 — ${p5.verdict === "miss" ? "manquée" : p5.verdict === "hit" ? "tenue" : "en attente"}. La porte était ≤ 3,90 au step 16 000 ; la mesure officielle y est ${pt ? pt.loss.toFixed(5) : "—"}. Source : docs/PREDICTIONS.md + runs/benchmarks.jsonl.`
        : "P5 n'apparaît pas dans l'instantané.";
    }
    if (/gsm8k|math|raison/.test(t(q))) {
      const g = s.gsm8k.filter((x) => (x.n ?? 0) >= 1000);
      if (!g.length)
        return "Aucune mesure GSM8K de taille complète dans l'instantané (le test complet demande le GPU).";
      const lines = g.map(
        (x) =>
          `• ${x.label}: ${x.n_correct}/${x.n} (${((x.accuracy ?? 0) * 100).toFixed(2)} %), marqueur « #### » ${((x.marker_rate ?? 0) * 100).toFixed(1)} %`,
      );
      return `${lines.join("\n")}\n\nSource : runs/reasoning_eval.json (extractor ${g[0].extractor ? "v2" : "v1 — voir la réserve de P1/P11"}).`;
    }
    if (/trou|gap|manquant|absent|pas fait/.test(t(q))) {
      if (!s.gaps.length) return "Aucun trou déclaré dans docs/METRICS.md §5.";
      return `${s.gaps
        .map((g) => `• ${g.gap} → ${g.consequence}\n  suite : ${g.next}`)
        .join("\n")}\n\nSource : docs/METRICS.md §5.`;
    }
    if (/vitesse|tok|gpu|temp|puissance/.test(t(q))) {
      const g = l?.gpu;
      if (!g)
        return "Les données matériel ne sont disponibles que sur la machine qui entraîne (mode direct). En mode Hub, le heartbeat les publie toutes les 30 s.";
      return `Débit ${(l?.tokens_per_s ?? 0).toFixed(0)} tok/s · rythme ${(l?.pace_s_per_step ?? 0).toFixed(2)} s/step.\nGPU ${g.name} : ${g.temp_c.toFixed(0)} °C, ${g.power_w.toFixed(1)}/${g.power_limit_w.toFixed(0)} W, ${g.clock_mhz.toFixed(0)}/${g.clock_max_mhz.toFixed(0)} MHz, ${g.vram_used_gb.toFixed(2)}/${g.vram_total_gb.toFixed(1)} Go.\nSource : nvidia-smi via scripts/live_sync.py.`;
    }
    if (/temps|rest|eta|combien de temps|fin/.test(t(q))) {
      const eta = l?.eta_h ?? s.status.eta_h;
      return `Il reste ${(step).toLocaleString("fr-FR")} / ${(l?.max_steps ?? s.status.max_steps).toLocaleString("fr-FR")} steps.\nRythme ${(l?.pace_s_per_step ?? s.status.pace_s_per_step ?? 0).toFixed(2)} s/step → environ ${eta ? eta.toFixed(1) : "—"} h de T4 restantes.\nSource : runs/bh-005/log.jsonl.`;
    }
    if (/perte|loss|bench|officiel/.test(t(q))) {
      const last = s.benchmarks[s.benchmarks.length - 1];
      return `La dernière mesure officielle (protocole fixe val-25×8×1024-seed1234-fp16) est ${last ? last.loss.toFixed(5) : "—"} au step ${last ? last.step : "—"} (ppl ${last ? last.ppl.toFixed(2) : "—"}).\nLa perte d'entraînement au step courant est ${(l?.train_loss ?? s.status.train_loss ?? 0).toFixed(4)} — ce n'est pas la même grandeur : la loss du run suit son propre échantillonnage et ne sert qu'à voir la tendance.\nSource : runs/benchmarks.jsonl, runs/bh-005/log.jsonl.`;
    }
    if (/donn[ée]e|corpus|token/.test(t(q))) {
      const d = s.data;
      return `Corpus : ${d.total_tokens.toLocaleString("fr-FR")} tokens, dont ${d.reasoning_share?.toFixed(2)} % de NuminaMath-CoT rendu deux fois.\nSHA-256 du corpus : ${d.sha256?.slice(0, 16)}…\nLe fichier de validation est le même que pour bh-004 (673f8f97…39cae), donc la courbe reste comparable.\nSource : data/tokenized/train_v2.meta.json.`;
    }
    if (/audit|vérif|contrôle|erreur|sain/.test(t(q))) {
      const a = s.audit;
      if (!a) return "Le statut de l'audit n'est pas dans l'instantané (il est écrit à chaque cycle par scripts/audit_docs.py).";
      return `Audit documentaire : ${a.ok ?? "?"}/${a.total ?? "?"} contrôles OK${a.failures?.length ? ` — échecs : ${a.failures.join(", ")}` : ""}.\nSource : runs/audit_status.json.`;
    }
    if (/checkpoint|poids|sauvegarde/.test(t(q))) {
      const c = l?.checkpoint ?? s.checkpoints[s.checkpoints.length - 1]?.name;
      return `Dernier checkpoint : ${c ?? "—"}. Le run en garde 2 en local ; le Hub en garde 2 aussi (élagage automatique). Source : runs/bh-005/ckpt_step*.pt.`;
    }
    if (/où|status|etat|état|avance/.test(t(q))) {
      const b = s.benchmarks[s.benchmarks.length - 1];
      return `Run ${s.status.run} — step ${step.toLocaleString("fr-FR")} / ${(l?.max_steps ?? s.status.max_steps).toLocaleString("fr-FR")} (${((l?.percent ?? s.status.percent ?? 0)).toFixed(1)} %).\nLR ${(l?.lr ?? s.status.lr ?? 0).toExponential(3)} · train ${(l?.train_loss ?? s.status.train_loss ?? 0).toFixed(4)} · val ${(l?.val_loss ?? s.status.val_last?.loss ?? 0).toFixed(4)}.\nDernière mesure officielle : ${b ? `${b.loss.toFixed(5)} @ ${b.step}` : "—"}.\nSource : runs/bh-005/log.jsonl + runs/benchmarks.jsonl.`;
    }
    return `Je ne sais répondre qu'à partir des artefacts (je ne calcule rien de nouveau). Essaie par exemple :\n${EXAMPLES.map((e) => `• ${e}`).join("\n")}\n\nLes sources : runs/bh-005/log.jsonl, runs/benchmarks.jsonl, runs/reasoning_eval.json, docs/METRICS.md, docs/PREDICTIONS.md.`;
  };

  const send = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setMsgs((m) => [
      ...m,
      { who: "user", text, at: new Date().toISOString() },
    ]);
    setInput("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [
        ...m,
        { who: "bot", text: answer(text), at: new Date().toISOString() },
      ]);
    }, 420);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto px-1 py-1">
        {msgs.length === 0 ? (
          <div className="rounded-xl border border-line bg-panel2/40 p-3 text-[11.5px] leading-relaxed text-dim">
            Pose une question sur le run. Je réponds **uniquement** à partir des
            artefacts du dépôt — je n'invente aucun chiffre, et chaque réponse
            cite son fichier source.
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {EXAMPLES.slice(0, 4).map((e) => (
                <button
                  key={e}
                  onClick={() => send(e)}
                  className="chip hover:border-accent/40 hover:text-accent"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.who === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed whitespace-pre-wrap ${
                m.who === "user"
                  ? "border-accent/25 bg-accent/8 text-ink"
                  : "border-line bg-panel2/60 text-dim"
              }`}
              style={{
                animation: "breathe 320ms ease-out",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}

        {typing ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-panel2/60 px-3 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-accent/70"
                  style={{ animation: `breathe 900ms ${i * 140}ms ease-in-out infinite` }}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pose ta question sur le run…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel2/70 px-3 py-2 text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/50"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent transition-colors hover:bg-accent/20"
        >
          →
        </button>
      </form>
    </div>
  );
}
