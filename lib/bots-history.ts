"use client";

import type { Bot } from "@/components/bots";

/**
 * The bots' history — *observed*, never invented.
 *
 * A bot's state is computed from the artefacts (a process alive or not, a
 * benchmark fresh or not, an audit green or not). When that computed state
 * changes, the transition is recorded here and persisted, so the board can
 * answer "how long has it been like this?" and "what happened before?" —
 * even after a reload.
 *
 * The rule: a transition is written only when the *state* changes. A poll
 * that returns the same state writes nothing, so the history stays a
 * history and not a log of polls.
 */

export const BOT_HISTORY_KEY = "bh.bots.history.v1";
export const BOT_UI_KEY = "bh.bots.ui.v1";

/** how many transitions are kept per bot */
const MAX_PER_BOT = 40;

export interface BotTransition {
  bot: string;
  from: Bot["state"] | null;
  to: Bot["state"];
  /** local timestamp of the observation */
  at: number;
}

export interface BotHistory {
  v: 1;
  /** the last known state of every bot */
  state: Record<string, Bot["state"]>;
  /** the transitions, newest first */
  transitions: BotTransition[];
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readBotHistory(): BotHistory {
  const s = storage();
  if (!s) return { v: 1, state: {}, transitions: [] };
  try {
    const raw = s.getItem(BOT_HISTORY_KEY);
    if (!raw) return { v: 1, state: {}, transitions: [] };
    const parsed = JSON.parse(raw) as BotHistory;
    if (parsed?.v !== 1 || typeof parsed.state !== "object") {
      return { v: 1, state: {}, transitions: [] };
    }
    return {
      v: 1,
      state: parsed.state ?? {},
      transitions: Array.isArray(parsed.transitions) ? parsed.transitions : [],
    };
  } catch {
    return { v: 1, state: {}, transitions: [] };
  }
}

export function writeBotHistory(h: BotHistory): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(BOT_HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* the history is a convenience, never a requirement */
  }
}

/**
 * Observe the current states and return the new transitions.
 *
 * The first observation of a bot is not a transition: there is nothing to
 * come *from*. It only establishes the baseline — "we saw it in this state
 * at this time" — which is exactly what "depuis" needs.
 */
export function observeBotStates(
  bots: Pick<Bot, "id" | "state">[],
  history: BotHistory,
  now = Date.now(),
): { history: BotHistory; fresh: BotTransition[] } {
  const state = { ...history.state };
  const fresh: BotTransition[] = [];
  const transitions = [...history.transitions];

  for (const b of bots) {
    const prev = state[b.id];
    if (prev === undefined) {
      state[b.id] = b.state;
      continue;
    }
    if (prev === b.state) continue;
    state[b.id] = b.state;
    const t: BotTransition = { bot: b.id, from: prev, to: b.state, at: now };
    fresh.push(t);
    transitions.unshift(t);
  }

  // keep the tail bounded, per bot
  const perBot = new Map<string, number>();
  const kept = transitions.filter((t) => {
    const n = perBot.get(t.bot) ?? 0;
    if (n >= MAX_PER_BOT) return false;
    perBot.set(t.bot, n + 1);
    return true;
  });

  const next: BotHistory = { v: 1, state, transitions: kept };
  writeBotHistory(next);
  return { history: next, fresh };
}

/** The transitions of one bot, newest first. */
export function transitionsOf(
  history: BotHistory,
  bot: string,
): BotTransition[] {
  return history.transitions.filter((t) => t.bot === bot);
}

/** When the bot entered its current state (local timestamp). */
export function stateSince(
  history: BotHistory,
  bot: string,
  current: Bot["state"],
): number | null {
  const list = transitionsOf(history, bot);
  for (const t of list) {
    if (t.to === current) return t.at;
  }
  return null;
}

/** The UI state (the selected bot, the filter) — persisted across reloads. */
export interface BotUi {
  selected: string | null;
  filter: string;
}

export function readBotUi(): BotUi {
  const s = storage();
  if (!s) return { selected: null, filter: "all" };
  try {
    const raw = s.getItem(BOT_UI_KEY);
    if (!raw) return { selected: null, filter: "all" };
    const parsed = JSON.parse(raw) as BotUi;
    return {
      selected: parsed.selected ?? null,
      filter: parsed.filter ?? "all",
    };
  } catch {
    return { selected: null, filter: "all" };
  }
}

export function writeBotUi(ui: BotUi): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(BOT_UI_KEY, JSON.stringify(ui));
  } catch {
    /* ignore */
  }
}
