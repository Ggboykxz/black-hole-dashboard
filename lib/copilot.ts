import type { Snapshot } from "./types";
import { f2, f4, f5, hours, int, pct, step as fmtStep } from "./format";

/**
 * The copilot's vocabulary — pure, testable, and deliberately small.
 *
 * The dashboard has no LLM behind it and does not pretend otherwise: this is
 * an *intent parser*, not a chatbot. It maps a phrase to a real target in the
 * DOM (`data-bot-target="…"`), a real route, or an honest "I don't know".
 * That is enough for an embodied guide, and it cannot hallucinate a metric:
 * every sentence it says is built from the snapshot or from the element it
 * is pointing at.
 */

export type TargetId =
  | "status"
  | "health"
  | "notifications"
  | "swarm"
  | "bots"
  | "chart-bench"
  | "chart-paired"
  | "capability"
  | "gaps"
  | "audit"
  | "live"
  | "chart-val"
  | "gpu"
  | "processes"
  | "variations"
  | "metrics"
  | "predictions"
  | "roadmap"
  | "training"
  | "data"
  | "analysis"
  | "comparison"
  | "journal"
  | "runbook"
  | "samples";

export interface TargetMeta {
  /** where the element lives; "" means every page (the header) */
  path: string;
  label: string;
}

export const TARGET_META: Record<TargetId, TargetMeta> = {
  status: { path: "/", label: "l'état du run" },
  health: { path: "/", label: "les signes vitaux de la session" },
  notifications: { path: "", label: "le centre de notifications" },
  swarm: { path: "/", label: "les avatars en direct" },
  bots: { path: "/", label: "l'équipe de bots" },
  "chart-bench": { path: "/", label: "la série officielle" },
  "chart-paired": { path: "/", label: "web vs raisonnement" },
  capability: { path: "/", label: "la table d'exactitude GSM8K" },
  gaps: { path: "/", label: "les trous assumés" },
  audit: { path: "/", label: "la vérification documentaire" },
  live: { path: "/live", label: "le panneau du direct" },
  "chart-val": { path: "/live", label: "l'évaluation du run" },
  gpu: { path: "/live", label: "le matériel (GPU)" },
  processes: { path: "/live", label: "les processus" },
  variations: { path: "/variations", label: "la traque des variations" },
  metrics: { path: "/metriques", label: "le registre des mesures" },
  predictions: { path: "/predictions", label: "les prédictions" },
  roadmap: { path: "/roadmap", label: "la feuille de route" },
  training: { path: "/entrainement", label: "l'entraînement" },
  data: { path: "/donnees", label: "les données" },
  analysis: { path: "/analyse", label: "l'analyse" },
  comparison: { path: "/comparaison", label: "la comparaison des runs" },
  journal: { path: "/journal", label: "le journal" },
  runbook: { path: "/runbook", label: "le runbook" },
  samples: { path: "/echantillons", label: "les échantillons" },
};

const ROUTES: { href: string; keys: string[] }[] = [
  { href: "/entrainement", keys: ["entrainement", "training", "recette"] },
  { href: "/donnees", keys: ["donnee", "donnees", "data", "corpus"] },
  { href: "/metriques", keys: ["metrique", "metriques", "registre"] },
  { href: "/predictions", keys: ["prediction", "predictions"] },
  { href: "/roadmap", keys: ["roadmap", "feuille de route", "prochaines etapes"] },
  { href: "/analyse", keys: ["analyse", "analysis"] },
  { href: "/comparaison", keys: ["comparaison", "compare", "runs"] },
  { href: "/journal", keys: ["journal", "changelog"] },
  { href: "/runbook", keys: ["runbook", "procedure", "regles"] },
  { href: "/echantillons", keys: ["echantillon", "echantillons", "samples"] },
];

/**
 * The pages, exposed as commands.
 *
 * The palette needs a *list*, not a parser: the copilot must be able to show
 * every destination it knows before the user types anything, and to filter
 * that list as they type. The order is the order of the dashboard itself.
 */
export const PAGES: { href: string; label: string; keys: string[] }[] = [
  { href: "/", label: "accueil", keys: ["accueil", "maison", "home"] },
  { href: "/live", label: "le direct", keys: ["direct", "live", "temps reel"] },
  {
    href: "/variations",
    label: "les variations",
    keys: ["variation", "variations", "delta", "ecart", "traque"],
  },
  {
    href: "/entrainement",
    label: "l'entraînement",
    keys: ["entrainement", "training", "recette"],
  },
  { href: "/donnees", label: "les données", keys: ["donnee", "donnees", "data", "corpus"] },
  {
    href: "/metriques",
    label: "le registre des mesures",
    keys: ["metrique", "metriques", "registre"],
  },
  { href: "/predictions", label: "les prédictions", keys: ["prediction", "predictions"] },
  { href: "/roadmap", label: "la feuille de route", keys: ["roadmap", "feuille de route"] },
  { href: "/analyse", label: "l'analyse", keys: ["analyse", "analysis"] },
  { href: "/comparaison", label: "la comparaison", keys: ["comparaison", "compare", "runs"] },
  { href: "/journal", label: "le journal", keys: ["journal", "changelog"] },
  { href: "/runbook", label: "le runbook", keys: ["runbook", "procedure", "regles"] },
  { href: "/echantillons", label: "les échantillons", keys: ["echantillon", "echantillons", "samples"] },
];

/** The panels the copilot can point at — an element, not a page. */
export const PANELS: TargetId[] = [
  "status",
  "health",
  "notifications",
  "swarm",
  "bots",
  "chart-bench",
  "chart-paired",
  "capability",
  "gaps",
  "audit",
  "live",
  "chart-val",
  "gpu",
  "processes",
  "variations",
];

/** Normalised text: lower case, no accents, single spaces. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+./%-]+/g, " ")
    .trim();
}

export type Intent =
  | { kind: "focus"; target: TargetId }
  | { kind: "navigate"; href: string }
  | { kind: "tour" }
  | { kind: "notifications" }
  | { kind: "scroll"; dir: "top" | "bottom" }
  | { kind: "help" }
  | { kind: "none" };

/**
 * Phrase → action. Ordered from the most specific to the most generic, so
 * "montre la courbe du direct" lands on the live panel rather than on the
 * home chart. Unknown input returns `none` — the copilot then says it did not
 * understand instead of guessing.
 */
export function parseIntent(question: string): Intent {
  const q = ` ${norm(question)} `;
  const has = (...words: string[]) => words.some((w) => q.includes(` ${w} `));

  if (has("aide", "help", "commandes", "que sais tu", "que peux tu")) {
    return { kind: "help" };
  }
  if (has("visite", "tour", "guide", "guider", "promene")) {
    return { kind: "tour" };
  }
  if (has("notification", "notifications", "alerte", "alertes", "cloche")) {
    return { kind: "notifications" };
  }
  if (has("haut", "top", "debut")) return { kind: "scroll", dir: "top" };
  if (has("bas", "bottom", "fin")) return { kind: "scroll", dir: "bottom" };

  // a target that exists on a known page
  if (has("gpu", "carte graphique", "carte", "temperature", "vram", "materiel")) {
    return { kind: "focus", target: "gpu" };
  }
  if (has("variation", "variations", "delta", "ecart", "chiffres", "traque", "tracking")) {
    return { kind: "focus", target: "variations" };
  }
  if (has("sante", "health", "session", "vivant", "alive", "signes vitaux")) {
    return { kind: "focus", target: "health" };
  }
  if (has("avatar", "avatars", "bot", "bots", "essaim", "swarm", "minion", "minions")) {
    return { kind: "focus", target: "swarm" };
  }
  if (has("processus", "process", "pid", "watchdog", "keepalive")) {
    return { kind: "focus", target: "processes" };
  }
  if (has("courbe", "graphique", "bench", "benchmark", "perte", "loss")) {
    return { kind: "focus", target: "chart-bench" };
  }
  if (has("capacite", "gsm", "gsm8k", "accuracy", "exactitude", "exact")) {
    return { kind: "focus", target: "capability" };
  }
  if (has("trou", "trous", "lacune", "lacunes", "gap", "gaps")) {
    return { kind: "focus", target: "gaps" };
  }
  if (has("audit", "verification", "documentaire", "doc", "docs")) {
    return { kind: "focus", target: "audit" };
  }
  if (has("direct", "live", "temps reel")) {
    return { kind: "focus", target: "live" };
  }
  if (has("val", "validation", "evaluation")) {
    return { kind: "focus", target: "chart-val" };
  }
  if (has("metrique", "metriques", "registre")) {
    return { kind: "focus", target: "metrics" };
  }
  if (has("prediction", "predictions")) {
    return { kind: "focus", target: "predictions" };
  }
  if (has("roadmap", "feuille de route")) {
    return { kind: "focus", target: "roadmap" };
  }
  if (has("entrainement", "training", "recette")) {
    return { kind: "focus", target: "training" };
  }
  if (has("donnee", "donnees", "data", "corpus")) {
    return { kind: "focus", target: "data" };
  }
  if (has("analyse", "analysis")) {
    return { kind: "focus", target: "analysis" };
  }
  if (has("comparaison", "compare")) {
    return { kind: "focus", target: "comparison" };
  }
  if (has("journal", "changelog")) {
    return { kind: "focus", target: "journal" };
  }
  if (has("runbook", "procedure", "regles")) {
    return { kind: "focus", target: "runbook" };
  }
  if (has("echantillon", "echantillons", "samples")) {
    return { kind: "focus", target: "samples" };
  }
  if (has("accueil", "maison", "home")) {
    return { kind: "navigate", href: "/" };
  }

  for (const route of ROUTES) {
    if (route.keys.some((k) => q.includes(` ${k} `))) {
      return { kind: "navigate", href: route.href };
    }
  }
  return { kind: "none" };
}

function ageLabel(iso: string | undefined | null): string {
  if (!iso) return "âge inconnu";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "âge inconnu";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}

/** The one-line, data-bound description of a target. */
export function describeTarget(id: TargetId, snapshot: Snapshot): string {
  const st = snapshot.status;
  const bench = snapshot.benchmarks;
  const last = bench[bench.length - 1];
  const p5 = snapshot.predictions.find((p) => p.id === "P5");
  const g = (snapshot as unknown as { gsm8k?: { accuracy: number | null }[] })
    .gsm8k;

  switch (id) {
    case "status":
      return `Run ${st.run} : step ${fmtStep(st.step)} / ${fmtStep(st.max_steps)} (${pct(st.percent, 1)}), perte ${f4(st.train_loss)}, cadence ${f2(st.pace_s_per_step)} s/step, ${hours(st.eta_h)} restantes.`;
    case "health":
      return "Ce bandeau lit le heartbeat /api/live : trainer, GPU, disque, keepalive. Il passe en rouge si le signal dépasse 120 s — et propose la commande de reprise.";
    case "notifications":
      return "Le centre de notifications applique des règles sur des mesures réelles : signal figé, GPU chaud, VRAM, cadence, disque. Les acquittements sont persistés sur cet appareil.";
    case "swarm":
      return "Les avatars se déplacent seuls : leur énergie vient de l'état réel de chaque acteur (working, idle, waiting, alert). Ils ne simulent aucune métrique.";
    case "bots":
      return "Un bot par acteur du système. Chaque fiche relie un rôle à un artefact et à l'action à mener ; rien n'est décoratif.";
    case "chart-bench":
      return last
        ? `La série officielle : dernier bench ${f5(last.loss)} au step ${fmtStep(last.step)} (ppl ${f2(last.ppl)}), protocole fixe val-25×8×1024-seed1234-fp16.`
        : "La série officielle n'a pas encore de point mesuré.";
    case "chart-paired":
      return "Web contre raisonnement sur la même fenêtre. La courbe violette est in-domain — elle ne mesure pas un transfert.";
    case "capability":
      return g && g.length
        ? `La table d'exactitude GSM8K : ${g
            .filter((x) => x.accuracy !== null)
            .map((x) => pct((x.accuracy as number) * 100, 2))
            .join(" · ") || "aucune mesure"}. Une accuracy, jamais une perte.`
        : "La table d'exactitude GSM8K n'a pas encore de mesure.";
    case "gaps":
      return "Les trous assumés : ce que le dashboard ne sait pas encore mesurer, et la conséquence de chaque lacune. Un trou déclaré vaut mieux qu'un chiffre inventé.";
    case "audit":
      return snapshot.audit
        ? `${snapshot.audit.ok}/${snapshot.audit.total} contrôles documentaires passent : benchmarks, verdict P5, registre, extracteur GSM8K, fichiers cités, liens, pointeurs LFS.`
        : "L'audit documentaire n'a pas encore tourné.";
    case "live":
      return `Le panneau direct interroge /api/live toutes les 1 s et journalise le feed dans localStorage. Il affiche l'âge réel du signal, jamais un faux « live ».`;
    case "chart-val":
      return st.val_last
        ? `L'évaluation du run : ${f4(st.val_last.loss)} au step ${fmtStep(st.val_last.step)}. C'est une tendance (20 batches), pas le chiffre publié.`
        : "Aucune évaluation du run pour l'instant.";
    case "gpu":
      return "Température, puissance, horloge SM et VRAM, mesurées par nvidia-smi. Sur cette T4 bridée, 75–80 °C et une horloge basse sont attendus sous charge.";
    case "processes":
      return "Les processus de la chaîne : trainer, watchdog, keepalive, heartbeat — avec leur PID et leur durée de vie.";
    case "variations":
      return "La traque des variations : chaque poll écrit un échantillon horodaté. Deltas, min/max et bande de contrôle sont calculés sur ces mesures réelles, avec la précision du producteur.";
    case "metrics":
      return "Le registre M1–M14 : définition, producteur unique, artefact, step et classe de comparabilité de chaque mesure.";
    case "predictions":
      return `Les prédictions sont écrites avant la mesure. P5 est actuellement ${p5?.verdict === "miss" ? "manquée" : p5?.verdict ?? "sans verdict"} — un miss reste visible.`;
    case "roadmap":
      return "La feuille de route est dérivée des artefacts : jalon du log, hypothèses de PREDICTIONS.md, lacunes de METRICS.md. Elle avance avec le run.";
    case "training":
      return `La recette du run : ${int(st.tokens_per_step)} tokens/step, LR ${(st.lr ?? 0).toExponential(2)}, perte ${f4(st.train_loss)}.`;
    case "data":
      return "La provenance du corpus : tokens, SHA-256, part de raisonnement. Le fichier de validation est identique à bh-004, sinon la courbe ne serait plus comparable.";
    case "analysis":
      return "L'analyse dérive pente, volatilité, extrapolation et écarts aux portes — chaque nombre affiche sa méthode et ses sources.";
    case "comparison":
      return "La comparaison des runs à protocole identique. C'est la seule comparaison qui a du sens entre modèles.";
    case "journal":
      return "Le changelog complet : chaque version, chaque défaut trouvé, chaque correction, avec sa date.";
    case "runbook":
      return "Les règles d'or, la reprise de session et les pièges déjà payés — pour qu'une session qui repart ailleurs ne les redécouvre pas.";
    case "samples":
      return "Quatre prompts figés, décodage glouton, CPU. C'est qualitatif : jamais une métrique, jamais un score.";
  }
}

/** The optional guided visit: an ordered walk through the real panels. */
export const TOUR: TargetId[] = [
  "status",
  "health",
  "swarm",
  "chart-bench",
  "capability",
  "audit",
  "live",
  "chart-val",
  "variations",
  "gpu",
  "metrics",
  "predictions",
  "roadmap",
];

/** Snapshot provenance, shown under every copilot reply. */
export function snapshotProvenance(snapshot: Snapshot): string {
  return `repères : instantané du ${snapshot.status.generated_at
    .replace("T", " ")
    .slice(0, 19)} UTC (âge ${ageLabel(snapshot.status.generated_at)}) — les chiffres affichés par la page restent la référence.`;
}

export const HELP_TEXT = [
  "Je sais :",
  "• « visite guidée » — parcourir les panneaux un par un",
  "• « le direct », « le GPU », « la santé », « les avatars »",
  "• « la courbe », « les prédictions », « le registre », « l'audit »",
  "• « notifications », « haut », « bas »",
  "• les pages : entraînement, données, analyse, comparaison, journal, runbook",
  "",
  "Je pointe l'élément réel, je le surligne et je lis ses chiffres. Je n'invente rien.",
].join("\n");
