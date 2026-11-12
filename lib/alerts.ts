import type { Live, Snapshot } from "./types";

export type Level = "info" | "warn" | "critical";

export interface Alert {
  id: string;
  level: Level;
  title: string;
  detail: string;
  action?: string;
  /** how long the condition has been true, in seconds */
  since_s?: number;
}

/**
 * The notification rules.
 *
 * Every rule is a *measurement*, not a mood: the GPU is hot because
 * `nvidia-smi` says so, the session is dead because the log has not moved.
 * A dashboard that notifies about things it cannot measure is a noise
 * generator; a dashboard that stays silent while the card melts is worse.
 */
export function buildAlerts(live: Live | null, snapshot: Snapshot): Alert[] {
  const out: Alert[] = [];
  const l = live;
  if (!l) {
    out.push({
      id: "no-live",
      level: "warn",
      title: "Aucune source live",
      detail:
        "Le dashboard n'a pas reçu de signal — ni le log local, ni le heartbeat du Hub.",
      action:
        "Vérifier que la chaîne est relancée : `setsid nohup bash scripts/watch_keepalive.sh configs/train-100m-bh005.json >> runs/bh-005/keepalive.log 2>&1 &`",
    });
    return out;
  }

  const age = l.age_s ?? null;

  // ---- the session ------------------------------------------------------
  if (age !== null && age > 120) {
    out.push({
      id: "stale",
      level: "critical",
      title: `Signal figé depuis ${age} s`,
      detail:
        "Le trainer n'écrit plus dans le log : la session est probablement morte.",
      action:
        "Relancer : `bash scripts/train_watchdog.sh configs/train-100m-bh005.json` — il repart du dernier checkpoint lisible.",
      since_s: age,
    });
  }

  // ---- the GPU ----------------------------------------------------------
  const g = l.gpu;
  if (g) {
    if (g.temp_c >= 78) {
      out.push({
        id: "gpu-hot",
        level: "warn",
        title: `GPU à ${g.temp_c.toFixed(0)} °C`,
        detail:
          "La carte est très chaude. Sur cette T4 bridée par la puissance, c'est attendu entre 75 et 80 °C — au-delà, il faut surveiller.",
        since_s: 0,
      });
    }
    const capped = g.power_w >= g.power_limit_w * 0.97;
    if (capped) {
      out.push({
        id: "gpu-powercap",
        level: "info",
        title: `Puissance bridée : ${g.power_w.toFixed(1)} / ${g.power_limit_w.toFixed(0)} W`,
        detail:
          "La carte est à son plafond de puissance : l'horloge SM s'effondre (≈ 660 MHz au lieu de 1 590). C'est le matériel et le budget Colab, pas le pipeline — le débit mesuré ici (12,9 k tok/s) en tient compte.",
        since_s: 0,
      });
    }
    if (g.util_gpu >= 95 && g.clock_mhz < g.clock_max_mhz * 0.5) {
      out.push({
        id: "gpu-clock",
        level: "warn",
        title: `Horloge effondrée : ${g.clock_mhz.toFixed(0)} / ${g.clock_max_mhz.toFixed(0)} MHz`,
        detail:
          "GPU saturé mais horloge au plancher : c'est la signature du bridage thermique/power cap.",
        since_s: 0,
      });
    }
    if (g.vram_total_gb > 0 && g.vram_used_gb / g.vram_total_gb > 0.92) {
      out.push({
        id: "gpu-vram",
        level: "warn",
        title: `VRAM ${g.vram_used_gb.toFixed(2)} / ${g.vram_total_gb.toFixed(1)} Go`,
        detail:
          "Moins de 8 % de VRAM libre : c'est la zone où un second processus GPU ferait tomber le trainer.",
        since_s: 0,
      });
    }
  }

  // ---- the pace ---------------------------------------------------------
  if (l.pace_s_per_step && l.pace_s_per_step > 3.2) {
    out.push({
      id: "pace",
      level: "warn",
      title: `Cadence dégradée : ${l.pace_s_per_step.toFixed(2)} s/step`,
      detail:
        "La normale sur cette T4 est 2,6 s/step. Un job CPU en parallèle (build npm, tokenisation, audit) vole les cycles du dataloader.",
      action: "`top` pour voir ce qui tourne ; `nice -n 19` pour les jobs longs.",
      since_s: 0,
    });
  }

  // ---- the disk ---------------------------------------------------------
  if (l.disk && l.disk.free_gb < 6) {
    out.push({
      id: "disk",
      level: "warn",
      title: `Disque : ${l.disk.free_gb.toFixed(1)} Go libres`,
      detail:
        "Le corpus (3,83 Go) et les checkpoints (1,3 Go chacun) saturent le disque.",
      action:
        "`rm -f runs/*/ckpt_step*.pt` — le Hub garde les 2 plus récents, la reprise est donc possible.",
      since_s: 0,
    });
  }

  // ---- the documentation -------------------------------------------------
  const docsAge = snapshot.status.generated_at
    ? Math.round(
        (Date.now() - new Date(snapshot.status.generated_at).getTime()) / 1000,
      )
    : null;
  if (docsAge !== null && docsAge > 1200) {
    out.push({
      id: "docs",
      level: "warn",
      title: `Documentation figée depuis ${Math.round(docsAge / 60)} min`,
      detail: "Le keepalive ne tourne plus : plus de courbes, plus de push.",
      action:
        "`bash scripts/watch_keepalive.sh configs/train-100m-bh005.json`",
      since_s: docsAge,
    });
  }

  return out;
}
