"use client";

/**
 * The copilot's own journal — small, local, and never a source of truth.
 *
 * It persists only *interface* state: whether the welcome bubble was seen,
 * where the visitor parked the avatar, and where they stopped in the guided
 * visit. A reload resumes the visit instead of starting it over. No metric is
 * ever stored here.
 */

export const COPILOT_KEY = "bh.copilot.v1";

export interface CopilotStored {
  v: 1;
  /** the greeting was seen (or dismissed) */
  seenWelcome: boolean;
  /** the guided visit is in progress */
  tourActive: boolean;
  /** index in TOUR */
  tourIndex: number;
  /** avatar centre, as a fraction of the viewport (0..1) */
  dock: { x: number; y: number };
  /** when the copilot was last on screen (local clock, ms) */
  lastSeenAt: number | null;
  /** how many times the visitor has come back */
  visits: number;
  /** the last mood it wore — the face remembers */
  lastMood: string | null;
}

const DEFAULT: CopilotStored = {
  v: 1,
  seenWelcome: false,
  tourActive: false,
  tourIndex: 0,
  dock: { x: 0.94, y: 0.84 },
  lastSeenAt: null,
  visits: 0,
  lastMood: null,
};

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCopilot(): CopilotStored {
  const s = storage();
  if (!s) return { ...DEFAULT, dock: { ...DEFAULT.dock } };
  try {
    const raw = s.getItem(COPILOT_KEY);
    if (!raw) return { ...DEFAULT, dock: { ...DEFAULT.dock } };
    const p = JSON.parse(raw) as Partial<CopilotStored>;
    if (p?.v !== 1) return { ...DEFAULT, dock: { ...DEFAULT.dock } };
    return {
      v: 1,
      seenWelcome: Boolean(p.seenWelcome),
      tourActive: Boolean(p.tourActive),
      tourIndex:
        typeof p.tourIndex === "number" && p.tourIndex >= 0
          ? Math.floor(p.tourIndex)
          : 0,
      dock: {
        x:
          typeof p.dock?.x === "number"
            ? Math.min(0.97, Math.max(0.03, p.dock.x))
            : DEFAULT.dock.x,
        y:
          typeof p.dock?.y === "number"
            ? Math.min(0.95, Math.max(0.08, p.dock.y))
            : DEFAULT.dock.y,
      },
      lastSeenAt:
        typeof p.lastSeenAt === "number" && Number.isFinite(p.lastSeenAt)
          ? p.lastSeenAt
          : null,
      visits: typeof p.visits === "number" ? Math.max(0, Math.floor(p.visits)) : 0,
      lastMood: typeof p.lastMood === "string" ? p.lastMood : null,
    };
  } catch {
    return { ...DEFAULT, dock: { ...DEFAULT.dock } };
  }
}

export function writeCopilot(state: CopilotStored): void {
  try {
    storage()?.setItem(COPILOT_KEY, JSON.stringify(state));
  } catch {
    /* the journal is a convenience, never a requirement */
  }
}
