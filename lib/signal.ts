/**
 * One vocabulary for "how fresh is this signal?".
 *
 * The dashboard has several feeds (local log, Hub heartbeat, localStorage
 * journal) and, before this module, each component re-derived its own
 * "offline" boolean. That is how a *stale* heartbeat could still be labelled
 * "EN DIRECT": the HTTP call succeeded, but the data inside was minutes old.
 *
 * The rule here is the one the UI must never break:
 *
 * * a source is **live** only if the request succeeded *and* the producer's
 *   own `updated_at` is recent;
 * * a frozen snapshot is **frozen**, never live;
 * * a failed request with a journal is **offline** (last known state), not
 *   "live" and not "empty";
 * * no data at all is **none** — with the exact reason, never a substitute.
 *
 * Thresholds: the trainer writes `log.jsonl` every ~26 s and the heartbeat
 * every 30 s, so 120 s is four missed beats — long enough to survive a
 * hiccup, short enough that a dead session is called dead.
 */

export const STALE_AFTER_S = 120;
export const POLL_MS = 3000;
export const HEARTBEAT_S = 30;

export type SignalSource = "local" | "hub" | "snapshot" | "cache" | "none";

export type SignalState =
  | "connecting"
  | "live"
  | "stale"
  | "offline"
  | "frozen"
  | "none";

export interface SignalInput {
  source: SignalSource | string;
  /** age of the producer's `updated_at`, in seconds */
  ageS: number | null;
  /** has at least one poll completed (success or failure)? */
  attempted: boolean;
  /** did the most recent poll fail? */
  fetchFailed: boolean;
  /** do we still hold a previous payload to display? */
  hasData: boolean;
}

export function signalState(i: SignalInput): SignalState {
  if (i.source === "snapshot") return "frozen";
  if (i.source === "cache") return "offline";
  if (i.source === "none") return i.attempted ? "none" : "connecting";
  if (i.fetchFailed) return i.hasData ? "offline" : "none";
  if (i.ageS !== null && i.ageS > STALE_AFTER_S) return "stale";
  return "live";
}

export interface SignalMeta {
  label: string;
  /** short sentence for the header tooltip */
  hint: string;
  /** hex, used inline so the tone follows the state everywhere */
  color: string;
  /** whether the state should read as a warning */
  warn: boolean;
}

export const SIGNAL_META: Record<SignalState, SignalMeta> = {
  connecting: {
    label: "CONNEXION…",
    hint: "premier poll en cours — aucune valeur n'est encore affichée, et rien n'est encore faux",
    color: "#38bdf8",
    warn: false,
  },
  live: {
    label: "EN DIRECT",
    hint: `le producteur a écrit il y a moins de ${STALE_AFTER_S} s`,
    color: "#34d399",
    warn: false,
  },
  stale: {
    label: "SIGNAL VIEILLI",
    hint: `aucune nouvelle mesure depuis plus de ${STALE_AFTER_S} s : les chiffres sont les derniers reçus`,
    color: "#fbbf24",
    warn: true,
  },
  offline: {
    label: "HORS LIGNE",
    hint: "la requête a échoué : le journal local affiche le dernier état connu, avec son âge",
    color: "#fbbf24",
    warn: true,
  },
  frozen: {
    label: "SNAPSHOT FIGÉ",
    hint: "instantané embarqué : une seule mesure, aucune variation possible",
    color: "#fb7185",
    warn: true,
  },
  none: {
    label: "AUCUN SIGNAL",
    hint: "aucune mesure exploitable : rien n'est inventé, rien n'est interpolé",
    color: "#fb7185",
    warn: true,
  },
};

/** 1 = just received, 0 = at (or past) the stale threshold. */
export function freshness(ageS: number | null): number {
  if (ageS === null) return 0;
  return Math.max(0, Math.min(1, 1 - ageS / STALE_AFTER_S));
}

/** "12 s", "3 min", "1 h 04" — never a fake precision. */
export function humanAge(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  if (s < 1) return "< 1 s";
  if (s < 90) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(Math.round(s % 60)).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}
