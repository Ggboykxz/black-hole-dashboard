"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Snapshot } from "@/lib/types";
import CopilotFace, { type FaceMood } from "./copilot-face";
import { useLiveFeed } from "./live-provider";
import {
  describeTarget,
  HELP_TEXT,
  norm,
  PAGES,
  PANELS,
  parseIntent,
  snapshotProvenance,
  TARGET_META,
  TOUR,
  type TargetId,
} from "@/lib/copilot";
import {
  readCopilot,
  writeCopilot,
  type CopilotStored,
} from "@/lib/copilot-store";

const AV = 58;
const BUBBLE_W = 322;

const GREETING = [
  "Bonjour — je suis le copilote du dashboard.",
  "Je peux vous guider, déplacer cet avatar vers un panneau précis, le surligner, ouvrir les notifications ou changer de page.",
  "Je lis le snapshot et les éléments réels : je n'invente aucun chiffre.",
].join(" ");

const SUGGESTIONS: { label: string; say: string }[] = [
  { label: "visite guidée", say: "visite guidée" },
  { label: "le direct", say: "le direct" },
  { label: "le GPU", say: "le gpu" },
  { label: "la courbe", say: "la courbe" },
  { label: "notifications", say: "notifications" },
  { label: "les prédictions", say: "les prédictions" },
];

/** One entry of the command palette. */
interface Cmd {
  id: string;
  group: string;
  label: string;
  hint: string;
  /** the words that make this command match a typed query */
  keys: string[];
  run: () => void;
}

const GROUP_ORDER = ["Actions", "Panneaux", "Pages"];

/** one glyph per group — the palette must be scannable, not a wall of text */
const GROUP_ICON: Record<string, string> = {
  Actions: "✦",
  Panneaux: "▣",
  Pages: "▤",
};

/**
 * The words that make a panel match a typed query.
 *
 * The labels are written for a human ("le matériel (GPU)"); the aliases are
 * written for the fingers ("carte", "vram"). Without them the palette would
 * hide the GPU behind a parenthesis.
 */
const PANEL_ALIASES: Partial<Record<TargetId, string[]>> = {
  status: ["etat", "statut", "status", "run", "resume"],
  health: ["sante", "health", "session", "vivant", "signes vitaux"],
  notifications: ["notification", "notifications", "alerte", "alertes", "cloche"],
  swarm: ["avatar", "avatars", "essaim", "swarm", "minibot", "minibots"],
  bots: ["bot", "bots", "equipe", "crew", "minibots"],
  "chart-bench": ["courbe", "bench", "benchmark", "perte", "loss", "serie"],
  "chart-paired": ["web", "raisonnement", "paire", "paired"],
  capability: ["gsm", "gsm8k", "exactitude", "accuracy", "capacite", "table"],
  gaps: ["trou", "trous", "lacune", "lacunes", "gap", "gaps"],
  audit: ["audit", "verification", "doc", "docs", "controles"],
  live: ["direct", "live", "temps reel", "panneau live", "en direct"],
  "chart-val": ["val", "validation", "evaluation", "eval", "eval du run"],
  gpu: ["gpu", "carte", "carte graphique", "materiel", "temperature", "vram"],
  processes: ["processus", "process", "pid", "watchdog", "keepalive"],
  variations: ["variation", "variations", "delta", "ecart", "traque", "chiffres"],
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** "il y a 3 h 12" — the age of the last visit, in words. */
function agoLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `il y a ${h} h ${String(m % 60).padStart(2, "0")}`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/**
 * The embodied copilot.
 *
 * A small creature lives *above* the dashboard (`position: fixed`,
 * `pointer-events: none` except on itself), and three light layers make it
 * useful:
 *
 * 1. **locomotion** — a requestAnimationFrame loop moves it to the element
 *    tagged `data-bot-target="…"`, and a spotlight ring tracks that element's
 *    `getBoundingClientRect()` live (scroll included);
 * 2. **actions** — a command bar (⌘K / Ctrl-K) maps a phrase to a real target,
 *    a real route, or an honest "je ne comprends pas"; it can also open the
 *    notification centre through a DOM event;
 * 3. **memory** — the visit index, the greeting and the avatar's parked
 *    position are persisted in `localStorage` (`lib/copilot-store.ts`), so a
 *    reload resumes the tour instead of restarting it.
 *
 * Deliberately no Rive/Three.js/CopilotKit: this is a 2D sandbox with two
 * vCPU and a live trainer. The same three layers are implemented with the
 * platform (SVG + rAF + CSS transforms), which keeps the bundle and the CPU
 * cost negligible. The "brain" is a deterministic intent parser, not an LLM —
 * it cannot fabricate a metric.
 */
export default function Copilot({ snapshot }: { snapshot: Snapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const feed = useLiveFeed();

  const [say, setSay] = useState<string | null>(null);
  const [bubble, setBubble] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<TargetId | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [eye, setEye] = useState({ x: 0, y: 0 });
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [gesture, setGesture] = useState<"wave" | "nod" | null>(null);

  const snapshotRef = useRef(snapshot);
  const pathnameRef = useRef(pathname);
  const persistentRef = useRef<CopilotStored>({
    v: 1,
    seenWelcome: true,
    tourActive: false,
    tourIndex: 0,
    dock: { x: 0.94, y: 0.84 },
    lastSeenAt: null,
    visits: 0,
    lastMood: null,
  });
  const dockRef = useRef({ x: 0.94, y: 0.84 });
  const targetElRef = useRef<HTMLElement | null>(null);
  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const draggingRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    offX: 0,
    offY: 0,
  });
  const pendingRef = useRef<TargetId | null>(null);
  const tourActiveRef = useRef(false);
  const tourIndexRef = useRef(0);
  const commandOpenRef = useRef(false);
  const bubbleRef = useRef(false);

  snapshotRef.current = snapshot;
  pathnameRef.current = pathname;
  commandOpenRef.current = commandOpen;

  const save = useCallback((patch: Partial<CopilotStored>) => {
    persistentRef.current = { ...persistentRef.current, ...patch };
    writeCopilot(persistentRef.current);
  }, []);

  // ---------------------------------------------------------------- resolve
  const resolve = useCallback((id: TargetId): boolean => {
    const el = document.querySelector<HTMLElement>(
      `[data-bot-target="${id}"]`,
    );
    if (!el) return false;
    targetElRef.current = el;
    setTarget(id);
    bubbleRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return true;
  }, []);

  // ------------------------------------------------------------------- go
  const go = useCallback(
    (id: TargetId, opts?: { quiet?: boolean }) => {
      const meta = TARGET_META[id];
      setSay(describeTarget(id, snapshotRef.current));
      setBubble(true);
      bubbleRef.current = true;
      if (!opts?.quiet) setCommandOpen(false);

      if (meta.path && meta.path !== pathnameRef.current) {
        pendingRef.current = id;
        targetElRef.current = null;
        setTarget(id);
        router.push(meta.path);
        return;
      }
      resolve(id);
    },
    [resolve, router],
  );

  const endTour = useCallback(() => {
    tourActiveRef.current = false;
    setTourActive(false);
    save({ tourActive: false });
    setTarget(null);
    targetElRef.current = null;
  }, [save]);

  // ---------------------------------------------------------------- the tour
  const startTour = useCallback(() => {
    tourActiveRef.current = true;
    setTourActive(true);
    tourIndexRef.current = 0;
    setTourIndex(0);
    save({ tourActive: true, tourIndex: 0, seenWelcome: true });
    setBubble(true);
    bubbleRef.current = true;
    go(TOUR[0]);
  }, [go, save]);

  const stepTour = useCallback(
    (dir: 1 | -1) => {
      const next = tourIndexRef.current + dir;
      if (next < 0) return;
      if (next >= TOUR.length) {
        endTour();
        setSay(
          "Voilà le tour complet : état du run, santé, avatars, série officielle, exactitude, audit, direct, éval, GPU, registre, prédictions, feuille de route. Le halo est éteint.",
        );
        setBubble(true);
        return;
      }
      tourIndexRef.current = next;
      setTourIndex(next);
      save({ tourActive: true, tourIndex: next });
      setGesture("nod");
      window.setTimeout(() => setGesture(null), 700);
      go(TOUR[next]);
    },
    [endTour, go, save],
  );

  // ------------------------------------------------------------- command bar
  const run = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const intent = parseIntent(text);
      setQuery("");

      switch (intent.kind) {
        case "focus":
          go(intent.target);
          break;
        case "tour":
          startTour();
          break;
        case "navigate":
          setCommandOpen(false);
          router.push(intent.href);
          setBubble(false);
          break;
        case "notifications":
          setCommandOpen(false);
          setBubble(false);
          window.dispatchEvent(new Event("bh:notifications-open"));
          break;
        case "scroll": {
          setCommandOpen(false);
          setBubble(false);
          window.scrollTo({
            top: intent.dir === "top" ? 0 : document.body.scrollHeight,
            behavior: "smooth",
          });
          break;
        }
        case "help":
          setCommandOpen(false);
          setSay(HELP_TEXT);
          setBubble(true);
          break;
        default:
          setCommandOpen(false);
          setSay(
            `Je ne comprends pas « ${text} ». Essayez « visite guidée », « le direct », « le GPU », ou demandez « aide ».`,
          );
          setBubble(true);
      }
    },
    [go, router, startTour],
  );

  // --------------------------------------------------------- command palette
  /**
   * The palette is a *list*, not a guessing game: every destination the
   * copilot knows is visible before anything is typed, and the filter narrows
   * it as the user writes. The parser still runs first on ⏎ (it understands
   * "montre la courbe du direct"), and the highlighted entry is the fallback
   * — so the two never fight over the same keystroke.
   */
  const [cmdIndex, setCmdIndex] = useState(0);

  const commands = useMemo<Cmd[]>(() => {
    const actions: Cmd[] = [
      {
        id: "act-tour",
        group: "Actions",
        label: "visite guidée",
        hint: "parcourir les panneaux réels, un par un",
        keys: ["visite", "guide", "tour", "promene", "visite guidee"],
        run: () => startTour(),
      },
      {
        id: "act-notif",
        group: "Actions",
        label: "ouvrir les notifications",
        hint: "les règles qui surveillent les mesures réelles",
        keys: ["notification", "notifications", "alerte", "alertes", "cloche"],
        run: () => {
          setCommandOpen(false);
          setBubble(false);
          window.dispatchEvent(new Event("bh:notifications-open"));
        },
      },
      {
        id: "act-help",
        group: "Actions",
        label: "ce que je sais faire",
        hint: "la liste complète de mes capacités",
        keys: ["aide", "help", "commandes", "capacites"],
        run: () => {
          setCommandOpen(false);
          setSay(HELP_TEXT);
          setBubble(true);
          bubbleRef.current = true;
        },
      },
      {
        id: "act-top",
        group: "Actions",
        label: "haut de page",
        hint: "revenir au bandeau d'état",
        keys: ["haut", "top", "debut"],
        run: () => window.scrollTo({ top: 0, behavior: "smooth" }),
      },
      {
        id: "act-bottom",
        group: "Actions",
        label: "bas de page",
        hint: "descendre au pied de la page",
        keys: ["bas", "bottom", "fin"],
        run: () =>
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
      },
    ];

    const panels: Cmd[] = PANELS.map((t) => ({
      id: `panel-${t}`,
      group: "Panneaux",
      label: TARGET_META[t].label,
      hint: TARGET_META[t].path ? `dans ${TARGET_META[t].path}` : "sur cette page",
      keys: [TARGET_META[t].label, t, ...(PANEL_ALIASES[t] ?? [])],
      run: () => go(t),
    }));

    const pages: Cmd[] = PAGES.map((p) => ({
      id: `page-${p.href}`,
      group: "Pages",
      label: p.label,
      hint: p.href,
      keys: [p.label, ...p.keys, p.href],
      run: () => {
        setCommandOpen(false);
        setBubble(false);
        router.push(p.href);
      },
    }));

    return [...actions, ...panels, ...pages];
  }, [go, router, startTour]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return commands;
    return commands.filter(
      (c) => norm(c.label).includes(q) || c.keys.some((k) => norm(k).includes(q)),
    );
  }, [commands, query]);

  // keep the highlight inside the list
  useEffect(() => {
    setCmdIndex((i) => (filtered.length ? Math.min(i, filtered.length - 1) : 0));
  }, [filtered.length]);

  // scroll the highlighted row into view (keyboard navigation)
  useEffect(() => {
    if (!commandOpen) return;
    const el = document.getElementById(`cmd-${cmdIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cmdIndex, commandOpen]);

  const execCommand = useCallback((c: Cmd) => {
    setQuery("");
    setCmdIndex(0);
    c.run();
  }, []);

  // ------------------------------------------------------- restore the journal
  useEffect(() => {
    const st = readCopilot();
    persistentRef.current = st;
    dockRef.current = st.dock;
    tourActiveRef.current = st.tourActive;
    tourIndexRef.current = Math.min(st.tourIndex, TOUR.length - 1);
    setTourActive(st.tourActive);
    setTourIndex(tourIndexRef.current);

    // the face remembers: it knows when it was last seen, and how many
    // times the visitor has come back
    const since = st.lastSeenAt ? Date.now() - st.lastSeenAt : null;
    save({
      lastSeenAt: Date.now(),
      visits: st.visits + 1,
      lastMood: st.lastMood ?? "idle",
    });

    if (st.tourActive) {
      const id = TOUR[tourIndexRef.current];
      const t = window.setTimeout(() => go(id, { quiet: true }), 650);
      return () => window.clearTimeout(t);
    }
    if (!st.seenWelcome) {
      const t = window.setTimeout(() => {
        setSay(
          since !== null
            ? `${GREETING}\nJe vous avais vu la dernière fois ${agoLabel(since)}${
                st.visits > 0 ? ` — c'était votre ${st.visits + 1}e visite.` : "."
              }`
            : GREETING,
        );
        setBubble(true);
        bubbleRef.current = true;
        setGesture("wave");
        window.setTimeout(() => setGesture(null), 1100);
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [go, save]);

  // ---------------------------------------- resume a pending target on a route
  useEffect(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    const id =
      pending ??
      (tourActiveRef.current ? TOUR[tourIndexRef.current] : null);
    if (!id) return;
    const meta = TARGET_META[id];
    if (meta.path && meta.path !== pathname) return;

    let tries = 0;
    let timer: number | undefined;
    const attempt = () => {
      if (resolve(id)) return;
      if (tries++ < 15) timer = window.setTimeout(attempt, 220);
    };
    timer = window.setTimeout(attempt, 220);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [pathname, resolve]);

  // --------------------------------------------------------------- geometry
  useEffect(() => {
    let raf = 0;

    const loop = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = targetElRef.current;
      const sp = spotlightRef.current;
      let ax: number;
      let ay: number;

      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        if (sp) {
          sp.style.opacity = "1";
          sp.style.left = `${Math.max(2, r.left - 6)}px`;
          sp.style.top = `${Math.max(2, r.top - 6)}px`;
          sp.style.width = `${Math.min(vw - 4, r.width + 12)}px`;
          sp.style.height = `${Math.min(vh - 4, r.height + 12)}px`;
        }
        // stand just outside the top-right corner, or inside if there is no room
        ax = clamp(r.right - AV * 0.45, 8, vw - AV - 8);
        ay = clamp(r.top > 96 ? r.top - AV * 0.7 : r.top + 10, 58, vh - AV - 8);
      } else {
        if (sp) sp.style.opacity = "0";
        const d = dockRef.current;
        ax = clamp(d.x * vw - AV / 2, 8, vw - AV - 8);
        ay = clamp(d.y * vh - AV / 2, 8, vh - AV - 8);
      }

      if (commandOpenRef.current) ay = Math.min(ay, vh - AV - 92);

      setPos((p) =>
        Math.abs(p.x - ax) > 0.4 || Math.abs(p.y - ay) > 0.4
          ? { x: ax, y: ay }
          : p,
      );

      // the eyes: the pointed element wins over the pointer
      let gx = 0;
      let gy = 0;
      const cx = ax + AV / 2;
      const cy = ay + AV / 2;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        gx = (r.left + r.width / 2 - cx) / 260;
        gy = (r.top + r.height / 2 - cy) / 260;
      } else if (pointerRef.current.active) {
        gx = (pointerRef.current.x - cx) / 220;
        gy = (pointerRef.current.y - cy) / 220;
      }
      gx = clamp(gx, -1, 1);
      gy = clamp(gy, -1, 1);
      setEye((e) =>
        Math.abs(e.x - gx) > 0.03 || Math.abs(e.y - gy) > 0.03
          ? { x: gx, y: gy }
          : e,
      );

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    const onPointer = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const onLeave = () => {
      pointerRef.current.active = false;
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // ------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => {
          if (!v) {
            setQuery("");
            setCmdIndex(0);
          }
          return !v;
        });
        setBubble(false);
        return;
      }
      if (e.key === "Escape") {
        setCommandOpen(false);
        setBubble(false);
        bubbleRef.current = false;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --------------------------------------------------------------- dragging
  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dockRef.current;
    const cx = d.x * window.innerWidth;
    const cy = d.y * window.innerHeight;
    draggingRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - cx,
      offY: e.clientY - cy,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    if (!drag.active) return;
    if (
      Math.abs(e.clientX - drag.startX) > 4 ||
      Math.abs(e.clientY - drag.startY) > 4
    ) {
      drag.moved = true;
    }
    const x = clamp((e.clientX - drag.offX) / window.innerWidth, 0.04, 0.96);
    const y = clamp((e.clientY - drag.offY) / window.innerHeight, 0.08, 0.94);
    dockRef.current = { x, y };
    // dragging means "put me here": stop pointing at a panel
    targetElRef.current = null;
    setTarget(null);
    const sp = spotlightRef.current;
    if (sp) sp.style.opacity = "0";
  }, []);

  const onUp = useCallback(() => {
    const drag = draggingRef.current;
    if (!drag.active) return;
    draggingRef.current.active = false;
    save({ dock: dockRef.current });
    if (!drag.moved) {
      // a click (not a drag) opens the command bar
      setCommandOpen((v) => {
        if (!v) {
          setQuery("");
          setCmdIndex(0);
        }
        return !v;
      });
      setBubble(false);
      bubbleRef.current = false;
    }
  }, [save]);

  // ------------------------------------------------------------------ render
  /**
   * The face is a **state**, not a decoration:
   * * `tour` — it walks you through the visit;
   * * `focus` — it points at a panel;
   * * `alert` — the signal is not live (the brows lift, the mouth tightens);
   * * `happy` — it just did what you asked.
   */
  const mood: FaceMood = tourActive
    ? "tour"
    : feed.state === "live" || feed.state === "connecting"
      ? target
        ? "focus"
        : "idle"
      : "alert";

  const speaking = Boolean(bubble && say);

  const bubbleW = Math.min(BUBBLE_W, Math.max(240, vp.w - 24));
  const bubbleLeft =
    vp.w === 0
      ? 0
      : pos.x > vp.w * 0.58
        ? clamp(pos.x - bubbleW - 12, 12, vp.w - bubbleW - 12)
        : clamp(pos.x + AV + 10, 12, vp.w - bubbleW - 12);
  const bubbleTop =
    vp.h === 0
      ? 0
      : clamp(pos.y - 24, 64, vp.h - Math.min(300, vp.h * 0.5) - 12);

  const stepMeta = TARGET_META[TOUR[tourIndex]];

  return (
    <>
      {/* the spotlight — a ring that tracks the real element, scroll included */}
      <div
        ref={spotlightRef}
        aria-hidden
        className="pointer-events-none fixed z-[45] rounded-xl border border-accent/70 opacity-0"
        style={{
          left: -9999,
          top: -9999,
          width: 0,
          height: 0,
          boxShadow:
            "0 0 0 1px rgba(56,189,248,.18), 0 0 34px -6px rgba(56,189,248,.55), inset 0 0 22px -12px rgba(56,189,248,.7)",
          transition: "opacity 200ms ease",
        }}
      />

      {/* the avatar */}
      <div
        role="button"
        tabIndex={0}
        aria-label="copilote — ouvrir la barre de commandes (Ctrl+K)"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCommandOpen((v) => {
              if (!v) {
                setQuery("");
                setCmdIndex(0);
              }
              return !v;
            });
            setBubble(false);
          }
        }}
        className="fixed left-0 top-0 z-[65] cursor-grab touch-none select-none active:cursor-grabbing"
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
          transition: draggingRef.current.active
            ? "none"
            : "transform 640ms cubic-bezier(.22,1.28,.36,1)",
          opacity: vp.w ? 1 : 0,
          filter: "drop-shadow(0 10px 18px rgba(0,0,0,.5))",
        }}
        title="copilote — cliquez pour commander, glissez pour déplacer"
      >
        <CopilotFace
          size={AV}
          speaking={speaking}
          mood={mood}
          eye={eye}
          gesture={gesture}
        />

        {/* the ring around the creature: its *state*, not decoration —
            a progress arc during the visit, a slow dashed halo when it is
            pointing at something, a quiet dotted circle when it is idle. */}
        <svg
          viewBox="0 0 100 100"
          className="pointer-events-none absolute"
          style={{ width: AV + 16, height: AV + 16, left: -8, top: -8, overflow: "visible" }}
        >
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="rgba(255,255,255,.07)"
            strokeWidth="1"
          />
          {tourActive ? (
            <>
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray={`${(2 * Math.PI * 48) * ((tourIndex + 1) / TOUR.length)} ${
                  2 * Math.PI * 48
                }`}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dasharray 420ms cubic-bezier(.22,1,.36,1)" }}
              />
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke="#38bdf8"
                strokeOpacity=".3"
                strokeWidth="1"
                strokeDasharray="3 7"
                style={{ animation: "ringSpin 9s linear infinite", transformOrigin: "50px 50px" }}
              />
            </>
          ) : target ? (
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="#38bdf8"
              strokeOpacity=".5"
              strokeWidth="1.2"
              strokeDasharray="3 7"
              style={{ animation: "ringSpin 7s linear infinite", transformOrigin: "50px 50px" }}
            />
          ) : (
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="rgba(255,255,255,.11)"
              strokeWidth="1"
              strokeDasharray="2 8"
            />
          )}
        </svg>

        {/* the status LED: what the copilot is doing right now */}
        <div className="pointer-events-none absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-[#0a0d12]/95 px-1.5 py-[1px] font-mono text-[8.5px]">
          <span
            className={`h-1 w-1 rounded-full ${
              tourActive ? "bg-accent" : target ? "bg-good" : "bg-faint"
            }`}
          />
          <span className={tourActive || target ? "text-accent/90" : "text-faint"}>
            {tourActive
              ? `visite ${tourIndex + 1}/${TOUR.length}`
              : target
                ? `pointe · ${TARGET_META[target].label}`
                : "libre"}
          </span>
        </div>
      </div>

      {/* the speech bubble */}
      {bubble && say ? (
        <div
          ref={(el) => {
            if (el) bubbleRef.current = true;
          }}
          role="status"
          aria-live="polite"
          className="fixed z-[66] overflow-hidden rounded-xl border border-accent/25 bg-[#0c1017]/97 shadow-2xl backdrop-blur-xl"
          style={{
            left: bubbleLeft,
            top: bubbleTop,
            width: bubbleW,
            animation: "copilotIn 200ms cubic-bezier(.2,.9,.3,1)",
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_#38bdf8]" />
            <span className="text-[10.5px] font-medium tracking-wide text-accent">
              COPILOTE
            </span>
            {tourActive ? (
              <span className="truncate font-mono text-[9px] text-faint">
                · {stepMeta.label}
              </span>
            ) : target ? (
              <span className="truncate font-mono text-[9px] text-faint">
                · {TARGET_META[target].label}
              </span>
            ) : null}
            <button
              onClick={() => setBubble(false)}
              aria-label="fermer la bulle"
              className="ml-auto flex h-5 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <p className="whitespace-pre-line px-3 py-2.5 text-[11px] leading-relaxed text-dim">
            {say}
          </p>

          {/* the progress of the visit, as dots: the user sees how long it is
              and can jump to any step instead of clicking "suivant" 12 times */}
          {tourActive ? (
            <div className="flex flex-wrap items-center gap-1 border-t border-line/60 px-3 py-2">
              {TOUR.map((t, i) => (
                <button
                  key={t}
                  onClick={() => {
                    tourIndexRef.current = i;
                    setTourIndex(i);
                    save({ tourActive: true, tourIndex: i });
                    go(t);
                  }}
                  title={TARGET_META[t].label}
                  aria-label={`étape ${i + 1} : ${TARGET_META[t].label}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === tourIndex
                      ? "w-5 bg-accent"
                      : i < tourIndex
                        ? "w-1.5 bg-accent/45 hover:bg-accent/70"
                        : "w-1.5 bg-white/15 hover:bg-white/30"
                  }`}
                />
              ))}
              <span className="ml-1 font-mono text-[9px] text-faint">
                {tourIndex + 1}/{TOUR.length}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
            {tourActive ? (
              <>
                <button
                  onClick={() => stepTour(-1)}
                  className="chip !px-2 !py-[2px] !text-[9.5px] hover:text-ink"
                >
                  ← précédent
                </button>
                <button
                  onClick={() => stepTour(1)}
                  className="chip !border-accent/40 !px-2 !py-[2px] !text-[9.5px] !text-accent"
                >
                  suivant →
                </button>
                <button
                  onClick={() => {
                    endTour();
                    setSay("Visite arrêtée. Je reste ici si vous avez besoin de moi.");
                  }}
                  className="ml-auto text-[9.5px] text-faint transition-colors hover:text-bad"
                >
                  quitter
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startTour}
                  className="chip !border-accent/40 !px-2 !py-[2px] !text-[9.5px] !text-accent"
                >
                  visite guidée
                </button>
                {target ? (
                  <button
                    onClick={() => resolve(target)}
                    className="chip !px-2 !py-[2px] !text-[9.5px] hover:!border-accent/40 hover:!text-accent"
                    title="revenir au panneau pointé"
                  >
                    repointer
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    setQuery("");
                    setCmdIndex(0);
                    setCommandOpen(true);
                    setBubble(false);
                  }}
                  className="chip !px-2 !py-[2px] !text-[9.5px] hover:text-ink"
                >
                  commander ⌘K
                </button>
                <button
                  onClick={() => {
                    setBubble(false);
                    save({ seenWelcome: true });
                  }}
                  className="ml-auto text-[9.5px] text-faint transition-colors hover:text-ink"
                >
                  plus tard
                </button>
              </>
            )}
          </div>

          <p className="border-t border-line/60 bg-black/20 px-3 py-1.5 font-mono text-[8.5px] leading-relaxed text-faint">
            {snapshotProvenance(snapshot)}
          </p>
        </div>
      ) : null}

      {/* the command bar */}
      {commandOpen ? (
        <>
          <button
            aria-label="fermer la barre de commandes"
            onClick={() => setCommandOpen(false)}
            className="fixed inset-0 z-[68] cursor-default bg-bg/55 backdrop-blur-[2px]"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-label="commandes du copilote"
            className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-[560px] overflow-hidden rounded-xl border border-accent/25 bg-[#0c1017]/98 shadow-2xl backdrop-blur-xl"
            style={{ animation: "copilotUp 200ms cubic-bezier(.2,.9,.3,1)" }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const hit = filtered[cmdIndex];
                if (hit) execCommand(hit);
                else run(query);
              }}
              className="flex items-center gap-2 border-b border-line px-3 py-2.5"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
                className="shrink-0 text-faint"
              >
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11 11l3.2 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCmdIndex(0);
                }}
                onKeyDown={(e) => {
                  if (!filtered.length) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCmdIndex((i) => (i + 1) % filtered.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCmdIndex((i) => (i - 1 + filtered.length) % filtered.length);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    setCmdIndex(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    setCmdIndex(filtered.length - 1);
                  }
                }}
                placeholder="où aller ? « le direct », « le GPU », « visite guidée »…"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-faint focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-accent transition-colors hover:bg-accent/20"
              >
                aller
              </button>
            </form>

            {/* the list — every destination, grouped, filtered as you type */}
            <div className="max-h-[46vh] overflow-y-auto px-1.5 py-1.5">
              {!query ? (
                <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => run(s.say)}
                      className="chip !px-2 !py-[2px] !text-[9.5px] hover:border-accent/40 hover:text-accent"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-[10.5px] leading-relaxed text-faint">
                  Aucune commande ne correspond à « {query} ». Essayez « le
                  direct », « le GPU », « notifications », ou « visite guidée ».
                </p>
              ) : null}

              {GROUP_ORDER.map((group) => {
                const items = filtered.filter((c) => c.group === group);
                if (!items.length) return null;
                return (
                  <div key={group} className="mb-1">
                    <div className="flex items-center gap-1.5 px-1.5 pb-1 pt-1.5 text-[9px] uppercase tracking-[0.12em] text-faint">
                      <span className="text-accent/70">{GROUP_ICON[group]}</span>
                      {group}
                    </div>
                    {items.map((c) => {
                      const idx = filtered.indexOf(c);
                      const on = idx === cmdIndex;
                      return (
                        <button
                          key={c.id}
                          id={`cmd-${idx}`}
                          onMouseEnter={() => setCmdIndex(idx)}
                          onClick={() => execCommand(c)}
                          className={`group flex w-full items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-1.5 text-left transition-colors ${
                            on ? "bg-accent/12" : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`h-3.5 w-[2px] shrink-0 rounded-full transition-colors ${
                              on ? "bg-accent" : "bg-transparent"
                            }`}
                          />
                          <span
                            className={`text-[11.5px] ${
                              on ? "text-ink" : "text-dim"
                            }`}
                          >
                            {c.label}
                          </span>
                          {c.hint ? (
                            <span className="ml-auto truncate font-mono text-[9px] text-faint">
                              {c.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <p className="border-t border-line/60 px-3 py-1.5 text-[9px] text-faint">
              ↑ ↓ pour choisir · ⏎ pour aller · je pointe l&apos;élément réel
              et je lis le snapshot — aucune réponse inventée · Échap pour
              fermer
            </p>
          </div>
        </>
      ) : null}

      <style>{`
        @keyframes copilotIn {
          from { opacity: 0; transform: translateY(6px) scale(.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes copilotUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
