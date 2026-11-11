import type { Live, Snapshot } from "./types";

export type Level = "ok" | "warn" | "critical";

export interface Check {
  id: string;
  label: string;
  level: Level;
  detail: string;
  /** what to do when it is not ok */
  action?: string;
}

export interface Health {
  level: Level;
  title: string;
  detail: string;
  checks: Check[];
}

/**
 * The session's health — computed, not guessed.
 *
 * The point of this module: if the Colab session dies, the trainer is
 * killed, the keepalive stops or the GPU disappears, the dashboard must say
 * so *and* say what to do. A dashboard that keeps showing the last numbers
 * as if everything were fine is worse than one that goes dark: it hides the
 * exact moment when the run stopped.
 */
export function buildHealth(snapshot: Snapshot, live: Live | null): Health {
  const now = Date.now();
  const s = snapshot;
  const l = live;
  const checks: Check[] = [];

  const step = l?.step ?? s.status.step;
  const maxSteps = l?.max_steps ?? s.status.max_steps;
  const finished = step >= maxSteps;

  // ---- 1. the trainer is alive and progressing --------------------------
  const updated = l?.updated_at ? new Date(l.updated_at).getTime() : null;
  const ageS = updated ? Math.round((now - updated) / 1000) : null;
  const pace = l?.pace_s_per_step ?? s.status.pace_s_per_step ?? 3;
  // the log writes every log_every steps; three missed windows = trouble
  const silentLimit = Math.max(120, Math.round(pace * 10 * 3));
  if (finished) {
    checks.push({
      id: "trainer",
      label: "Entraînement",
      level: "ok",
      detail: `run terminé — step ${step.toLocaleString("fr-FR")} / ${maxSteps.toLocaleString("fr-FR")}`,
    });
  } else if (ageS !== null && ageS > silentLimit) {
    checks.push({
      id: "trainer",
      label: "Entraînement",
      level: "critical",
      detail: `aucune écriture depuis ${ageS} s (limite ${silentLimit} s) — la session est probablement morte`,
      action:
        "Relancer : `setsid nohup bash scripts/train_watchdog.sh configs/train-100m-bh005.json >> runs/bh-005/watchdog.log 2>&1 &` — il repart du dernier checkpoint lisible (docs/RECOVERY.md §1).",
    });
  } else if (l === null) {
    // no live payload at all: the trainer's state is *unknown*, which is not
    // the same as "ok" — and certainly not "dead". A dashboard that cries
    // "the session is dead" because it has not received anything yet is a
    // dashboard that lies in both directions.
    checks.push({
      id: "trainer",
      label: "Entraînement",
      level: "warn",
      detail:
        "aucun signal live reçu — l'état du trainer est inconnu, pas mort",
      action:
        "Vérifier la chaîne : `ps -eo pid,args | grep -E 'blackhole.train|train_watchdog|keepaliv[e]'` puis, si le trainer manque, `bash scripts/train_watchdog.sh configs/train-100m-bh005.json`.",
    });
  } else {
    checks.push({
      id: "trainer",
      label: "Entraînement",
      level: "ok",
      detail: `step ${step.toLocaleString("fr-FR")} · écriture il y a ${ageS ?? "—"} s`,
    });
  }

  // ---- 2. the heartbeat --------------------------------------------------
  if (ageS !== null && ageS > 120 && !finished) {
    checks.push({
      id: "heartbeat",
      label: "Pouls (live_sync)",
      level: "critical",
      detail: `dernier battement il y a ${ageS} s — le keepalive est probablement arrêté`,
      action:
        "Relancer le keepalive (et son gardien) : `setsid nohup bash scripts/watch_keepalive.sh configs/train-100m-bh005.json >> runs/bh-005/keepalive.log 2>&1 &`",
    });
  } else {
    checks.push({
      id: "heartbeat",
      label: "Pouls (live_sync)",
      level: "ok",
      detail: ageS !== null ? `il y a ${ageS} s` : "inconnu",
    });
  }

  // ---- 3. the processes ---------------------------------------------------
  const proc = (role: string) => l?.processes?.find((p) => p.role === role);
  const trainer = proc("trainer");
  const keepalive = proc("keepalive");
  const watchdog = proc("watchdog");
  if (l?.processes?.length) {
    checks.push({
      id: "trainer-proc",
      label: "Processus trainer",
      level: trainer ? "ok" : finished ? "ok" : "critical",
      detail: trainer
        ? `pid ${trainer.pid} · vivant depuis ${Math.floor(trainer.up_s / 3600)} h`
        : "introuvable",
      action: trainer
        ? undefined
        : "Le watchdog le relance : `bash scripts/train_watchdog.sh configs/train-100m-bh005.json`",
    });
    checks.push({
      id: "keepalive-proc",
      label: "Processus keepalive",
      level: keepalive ? "ok" : "warn",
      detail: keepalive ? `pid ${keepalive.pid}` : "introuvable",
      action: keepalive
        ? undefined
        : "Le garde-fou le relance : `bash scripts/watch_keepalive.sh configs/train-100m-bh005.json`",
    });
    checks.push({
      id: "watchdog-proc",
      label: "Processus watchdog",
      level: watchdog ? "ok" : "warn",
      detail: watchdog ? `pid ${watchdog.pid}` : "introuvable",
    });
  } else {
    checks.push({
      id: "processes",
      label: "Processus",
      level: "warn",
      detail: "état des processus indisponible (mode Hub sans heartbeat récent)",
    });
  }

  // ---- 4. the GPU ----------------------------------------------------------
  const gpu = l?.gpu;
  if (gpu) {
    const throttled = gpu.power_w >= gpu.power_limit_w * 0.9;
    checks.push({
      id: "gpu",
      label: "GPU",
      level: "ok",
      detail: `${gpu.name} · ${gpu.temp_c.toFixed(0)} °C · ${gpu.power_w.toFixed(1)}/${gpu.power_limit_w.toFixed(0)} W${
        throttled ? " — bridée par la puissance" : ""
      }`,
    });
  } else if (l) {
    checks.push({
      id: "gpu",
      label: "GPU",
      level: "warn",
      detail: "aucune carte visible depuis le dashboard",
    });
  }

  // ---- 5. the disk ---------------------------------------------------------
  if (l?.disk) {
    const low = l.disk.free_gb < 6;
    checks.push({
      id: "disk",
      label: "Disque",
      level: low ? "warn" : "ok",
      detail: `${l.disk.free_gb.toFixed(1)} Go libres (${l.disk.used_percent.toFixed(0)} % utilisés)`,
      action: low
        ? "Libérer : `rm -f runs/*/ckpt_step*.pt` (le Hub garde les 2 plus récents) ou `scripts/data_audit.py` ne doit PAS tourner pendant l'entraînement."
        : undefined,
    });
  }

  // ---- 6. the pace --------------------------------------------------------
  if (pace) {
    const degraded = pace > 3.2;
    checks.push({
      id: "pace",
      label: "Cadence",
      level: degraded ? "warn" : "ok",
      detail: `${pace.toFixed(2)} s/step${degraded ? " — plus lent que la normale (2,6 s/step)" : ""}`,
      action: degraded
        ? "Vérifier qu'aucun job CPU ne tourne en parallèle (`top`) : le dataloader partage les 2 vCPU avec le trainer."
        : undefined,
    });
  }

  // ---- 7. the last push ----------------------------------------------------
  const pushAgo = s.status.generated_at
    ? Math.round((now - new Date(s.status.generated_at).getTime()) / 1000)
    : null;
  if (pushAgo !== null) {
    /* « docs anciens » a deux causes très différentes, et le message
       doit faire la différence : le keepalive mort (le heartbeat est
       vieux aussi — l'action est de le relancer), ou une page servie
       depuis un build statique dont l'artefact empaqueté date du
       build (le heartbeat, lui, est frais — le run va bien, c'est
       l'affichage qui est en retard d'un cycle). Sans cette distinction
       le panneau affirmait « le keepalive ne tourne plus » sur un run
       dont le signal battait à 8 s. */
    const signalAgo = live?.read_at
      ? Math.round((now - new Date(live.read_at).getTime()) / 1000)
      : live?.updated_at
        ? Math.round((now - new Date(live.updated_at).getTime()) / 1000)
        : null;
    const keepaliveLikelyAlive = signalAgo !== null && signalAgo < 120;
    checks.push({
      id: "docs",
      label: "Documentation",
      level: pushAgo > 1200 ? "warn" : "ok",
      detail: `blocs de statut régénérés il y a ${Math.floor(pushAgo / 60)} min`,
      action:
        pushAgo > 1200
          ? keepaliveLikelyAlive
            ? "Le signal du run est frais — ce sont les blocs de statut servis qui datent (build statique). Vérifier le dernier cycle : `tail runs/bh-005/keepalive.log`"
            : "Le keepalive ne tourne plus : `bash scripts/watch_keepalive.sh configs/train-100m-bh005.json`"
          : undefined,
    });
  }

  const level: Level = checks.some((c) => c.level === "critical")
    ? "critical"
    : checks.some((c) => c.level === "warn")
      ? "warn"
      : "ok";

  const title =
    level === "critical"
      ? "La session est en difficulté"
      : level === "warn"
        ? "La session fonctionne, avec des reserves"
        : finished
          ? "Run terminé"
          : "Session vivante";

  const detail =
    level === "critical"
      ? "Un élément critique a été détecté. Le run peut être arrêté : les actions ci-dessous disent quoi relancer, et dans quel ordre."
      : level === "warn"
        ? "Aucun arrêt, mais un point mérite un œil — les détails sont listés."
        : "Entraînement, supervision et publication fonctionnent normalement.";

  return { level, title, detail, checks };
}
