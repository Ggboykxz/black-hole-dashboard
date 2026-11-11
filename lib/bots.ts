import type { Bot } from "@/components/bots";
import type { Live, Snapshot } from "./types";

/**
 * The crew's state, computed from the artefacts.
 *
 * Every ball is bound to a real measurement — a ball that "works" does so
 * because its artefact says something changed, not because of a timer.
 */

const ago = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
};

const hhmmss = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(11, 19);
};

export function buildBots(snapshot: Snapshot, live: Live | null): Bot[] {
  const now = Date.now();
  const s = snapshot;
  const l = live;
  const step = l?.step ?? s.status.step;
  const maxSteps = l?.max_steps ?? s.status.max_steps;
  const percent = maxSteps ? step / maxSteps : 0;

  const bench = s.benchmarks;
  const lastBench = bench[bench.length - 1];
  const benchAge = ago(lastBench?.measured_at ?? null, now);

  const resolved = s.predictions.filter(
    (p) => p.verdict === "hit" || p.verdict === "miss",
  ).length;
  const hits = s.predictions.filter((p) => p.verdict === "hit").length;
  const misses = s.predictions.filter((p) => p.verdict === "miss").length;
  const pending = s.predictions.filter((p) => p.verdict === "pending").length;

  const proc = (role: string) => l?.processes?.find((p) => p.role === role);
  const trainer = proc("trainer");
  const watchdog = proc("watchdog");
  const keepalive = proc("keepalive");
  const heartbeat = proc("heartbeat");

  const audit = s.audit;
  const auditOk = audit?.ok ?? null;
  const auditTotal = audit?.total ?? null;

  return [
    {
      id: "trainer",
      name: "L'Entraîneur",
      role: "blackhole.train — le run lui-même",
      // **Absence de preuve n'est pas preuve d'absence.** Sans payload live
      // on ne *sait pas* si le trainer tourne : l'état est « en attente »,
      // jamais « vigilance ». « Vigilance » signifie : on a la liste des
      // processus et le trainer n'y est pas.
      state: l ? (trainer ? "working" : "alert") : "waiting",
      progress: percent,
      color: "#38bdf8",
      headline: l
        ? `step ${step.toLocaleString("fr-FR")} · train ${(
            l?.train_loss ?? s.status.train_loss ?? 0
          ).toFixed(4)}`
        : "en attente du premier signal live",
      detail: `Le trainer écrit une ligne de log tous les 10 steps (~26 s sur cette T4).\nLR ${(l?.lr ?? s.status.lr ?? 0).toExponential(3)} · grad-norm ${(
        l?.grad_norm ?? s.status.grad_norm ?? 0
      ).toFixed(3)} · ${Math.round(
        l?.tokens_per_s ?? s.status.tokens_per_s ?? 0,
      ).toLocaleString("fr-FR")} tok/s.\n${(percent * 100).toFixed(1)} % du run, ${
        l?.eta_h ?? s.status.eta_h
      }?.toFixed?.(1) ?? "—"} h restantes.\nSource : runs/bh-005/log.jsonl.`,
      source: "runs/bh-005/log.jsonl",
    },
    {
      id: "watchdog",
      name: "Le Gardien",
      role: "train_watchdog.sh — relance le trainer",
      state: l ? (watchdog ? "working" : "alert") : "waiting",
      progress: watchdog ? Math.min(1, watchdog.up_s / 86400) : null,
      color: "#a78bfa",
      headline: watchdog
        ? `vivant depuis ${Math.floor(watchdog.up_s / 3600)} h`
        : l
          ? "introuvable — il faut le relancer"
          : "en attente du premier signal live",
      detail: `Le gardien cherche un checkpoint lisible (poids + moments d'Adam) et\nrelance l'entraînement avec --resume auto. Il ne peut jamais repartir de poids\naléatoires sans le dire : le fallback est explicite dans la config.\nIl s'exite tout seul à max_steps.\nSource : configs/train-100m-bh005.json + runs/bh-005/watchdog.log.`,
      source: "runs/bh-005/watchdog.log",
    },
    {
      id: "keepalive",
      name: "Le Veilleur",
      role: "keepalive.sh — docs, push, benchmarks",
      state: l ? (keepalive ? "working" : "alert") : "waiting",
      progress: null,
      color: "#34d399",
      headline: keepalive
        ? `cycle de 300 s · vivant depuis ${Math.floor(keepalive.up_s / 3600)} h`
        : l
          ? "absent"
          : "en attente du premier signal live",
      detail: `À chaque cycle (300 s) : courbes → échantillons → blocs de statut →\nregistre des mesures → audit → push vérifié par SHA-256 → élagage du Hub →\nbenchmark du nouveau checkpoint → série secondaire.\nSource : runs/bh-005/keepalive.log.`,
      source: "runs/bh-005/keepalive.log",
    },
    {
      id: "heartbeat",
      name: "Le Pouls",
      role: "live_sync.py — l'état live",
      state: heartbeat ? "working" : "waiting",
      progress: null,
      color: "#22d3ee",
      headline: heartbeat
        ? `battement toutes les 30 s (pid ${heartbeat.pid})`
        : "en attente du prochain battement",
      detail: `Le pouls publie la queue du log, le GPU, les processus, le disque et les\nderniers benchmarks dans un dépôt dédié (black-hole-live) : c'est ce que le\ndashboard déployé sur Vercel suit. Il ne lit que — jamais il n'écrit dans le log.\nSource : runs/bh-005/live.json.`,
      source: "runs/bh-005/live.json",
    },
    {
      id: "auditor",
      name: "L'Auditeur",
      role: "audit_docs.py — la doc dit-elle vrai ?",
      state:
        auditOk !== null && auditTotal !== null
          ? auditOk === auditTotal
            ? "working"
            : "alert"
          : "waiting",
      progress:
        auditOk !== null && auditTotal ? auditOk / auditTotal : null,
      color: "#fbbf24",
      headline:
        auditOk !== null && auditTotal
          ? `${auditOk}/${auditTotal} contrôles OK`
          : "pas encore de rapport",
      detail: `L'auditeur compare la documentation aux artefacts : le dernier benchmark\naffiché, le verdict de P5, le bloc du registre, l'extracteur GSM8K, les\nfichiers cités, les liens, et l'absence de pointeur Git-LFS.\nUn échec ne tue jamais le run : il est journalisé et poussé.\nSource : runs/audit_status.json.`,
      source: "runs/audit_status.json",
    },
    {
      id: "measure",
      name: "Le Mesureur",
      role: "benchmark.py — le protocole officiel",
      state: benchAge !== null && benchAge < 400 ? "working" : "waiting",
      progress: Math.min(1, (bench.length || 0) / 30),
      color: "#f472b6",
      headline: lastBench
        ? `${lastBench.loss.toFixed(5)} @ ${lastBench.step} (ppl ${lastBench.ppl.toFixed(2)})`
        : "aucune mesure",
      detail: `Une mesure par checkpoint (500 steps), 25 × 8 × 1 024 tokens de val.bin,\ngraine 1234, fp16 — le seul protocole comparable entre runs.\nDernière : ${
        lastBench ? `${lastBench.loss.toFixed(5)} au step ${lastBench.step}` : "—"
      }${benchAge !== null ? ` (il y a ${benchAge} s)` : ""}.\nSource : runs/benchmarks.jsonl.`,
      source: "runs/benchmarks.jsonl",
    },
    {
      id: "ledger",
      name: "Le Registre",
      role: "metrics_ledger.py — M1…M14",
      state: "working",
      progress: Math.min(1, (s.registry.length || 0) / 14),
      color: "#c084fc",
      headline: `${s.registry.length} métriques · ${s.gaps.length} trous déclarés`,
      detail: `Chaque métrique publiée est enregistrée avec sa définition, son unique\nproducteur, son artefact, son step et sa classe de comparabilité — et ce qu'elle\nne dit pas.\n${s.gaps
        .map((g) => `• ${g.gap}`)
        .join("\n")}\nSource : docs/METRICS.md.`,
      source: "docs/METRICS.md",
    },
    {
      id: "predictor",
      name: "Le Prédicteur",
      role: "PREDICTIONS.md — écrit avant, jamais retouché",
      state: pending > 0 ? "waiting" : "working",
      progress: s.predictions.length ? resolved / s.predictions.length : null,
      color: "#fb923c",
      headline: `${hits} tenus · ${misses} manqués · ${pending} en attente`,
      detail: `Les prédictions sont écrites *avant* la mesure et ne sont jamais réécrites\naprès : un miss reste un miss.\n${s.predictions
        .map((p) => `${p.id} — ${p.verdict}`)
        .join(" · ")}\nSource : docs/PREDICTIONS.md.`,
      source: "docs/PREDICTIONS.md",
    },
    {
      id: "samples",
      name: "L'Échantillonneur",
      role: "sample_progress.py — ce qu'il écrit",
      state: "waiting",
      progress: null,
      color: "#38bdf8",
      headline: `${l?.n_samples ?? "—"} générations archivées`,
      detail: `Quatre prompts figés, décodage glouton, CPU. Qualitatif par nature :\nce n'est jamais une métrique, et il ne faut pas y lire une mesure de qualité.\nSource : runs/SAMPLES.md + runs/samples_progress.jsonl.`,
      source: "runs/SAMPLES.md",
    },
    {
      id: "doc",
      name: "Le Documentateur",
      role: "sync_docs.py — les blocs de statut",
      state: "working",
      progress: null,
      color: "#94a3b8",
      headline: `état écrit à ${hhmmss(s.status.generated_at)} UTC`,
      detail: `Le statut est régénéré dans README, README.fr, CHANGELOG, AGENTS et\nSTATUS.md — toujours avec le step de la mesure à côté du chiffre, pour que\nrien ne puisse être lu comme « actuel » quand il ne l'est pas.\nSource : scripts/sync_docs.py.`,
      source: "runs/bh-005/STATUS.md",
    },
  ];
}
