"use client";

import { type CSSProperties, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

/* ══ Toast stack ══════════════════════════════════════════
   Three toasts, always: the newest in front, the two before it
   tucked behind with a sliver of each showing above it, a step
   smaller each and a barely-there grey (the reference's tones). Point at the stack and it
   fans out into a list; move away and it gathers back up.

   ── ONE SPRING, THREE PLACES ────────────────────────────
   A toast's place is worked out from how far back it is and
   whether the stack is open, and Framer springs it there. Opening,
   closing, a toast leaving and the next arriving are all the same
   move — every toast heading for its new place on the same spring,
   a touch under critical so it settles with a hint of give.

   ── HOVER IS THE WHOLE FRAME ────────────────────────────
   The stack opens about its middle, so the front toast moves when
   it opens. Hovering the toasts themselves would let the list slide
   out from under the pointer and close again; the frame is the
   list's own size, so hovering it is hovering the list. Pointer
   over/out with a containment test rather than enter/leave, so the
   wall's demonstration — which dispatches its own pointer events,
   and leaves with no relatedTarget — opens and closes it too (the
   tilt card's note has the long version).

   ── IT NEVER RUNS OUT ──────────────────────────────────
   Dismiss one and it slides away; a new one rises in at the front
   from the pool, so there are always three. The action button turns
   the failed push into the push going through, in place.

   ── LE MOINS DE MOUVEMENT POSSIBLE (règle du dépôt) ─────
   `prefers-reduced-motion` pose la pile : le déploiement reste
   lisible (les positions sont les mêmes) mais sans ressort —
   la même règle que les slimes du swarm, sans exception nouvelle. */

type Kind = "success" | "info" | "error" | "warning";
type Toast = { id: number; kind: Kind; title: string; body: string; action?: string };

const ICON: Record<Kind, LucideIcon> = {
  success: CircleCheck,
  info: Info,
  error: CircleX,
  warning: TriangleAlert,
};

/* le pool reprend les règles de notification du run (température GPU,
   bridage de puissance, push Hub, mesure officielle) — les mêmes sujets
   que le centre de notifications, en démonstration de micro-activité */
const POOL: Omit<Toast, "id">[] = [
  { kind: "error", title: "Push du checkpoint refusé", body: "Le Hub a refusé le commit.", action: "Réessayer" },
  { kind: "info", title: "Signal stale", body: "Aucun heartbeat depuis 40 s." },
  { kind: "success", title: "Checkpoint écrit", body: "ckpt_step24500.pt — étape 24 500." },
  { kind: "warning", title: "GPU à 77 °C", body: "Le T4 se bride : ~2,7 s/step attendus." },
  { kind: "success", title: "Mesure officielle", body: "Bench 3.8538 @ 24 500 enregistré." },
];

const W = 300;
const H = 64;
const SHOWN = 3;
/* a touch under critical: it settles with a hint of give, no wobble */
const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 1 } as const;

export function ToastStack({
  peek = 14,
  gap = 10,
  corner = 18,
}: {
  peek?: number;
  gap?: number;
  /* 18 = le rayon des cartes du dashboard (globals.css `.card`), pas les
     20 px de la référence — c'est le mapping de --tst-r */
  corner?: number;
}) {
  /* front first; ids count up so a returning toast is a new element */
  const next = useRef(SHOWN);
  const [stack, setStack] = useState<Toast[]>(() =>
    POOL.slice(0, SHOWN).map((t, i) => ({ ...t, id: i })),
  );
  const [leaving, setLeaving] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const still = useReducedMotion();

  /* the frame is the open list's size; both states sit in its middle */
  const listH = SHOWN * H + (SHOWN - 1) * gap;
  const stackH = H + (SHOWN - 1) * peek;
  const FH = listH;

  const place = (k: number) => {
    if (open) {
      /* the list: front at the bottom, the rest above it */
      const top = (FH - listH) / 2;
      return { y: top + (SHOWN - 1 - k) * (H + gap), scale: 1 };
    }
    /* the stack: front at the bottom, each one behind a peek higher
       and a step smaller, hanging from its top edge */
    const top = (FH - stackH) / 2;
    const d = Math.min(k, SHOWN - 1);
    return { y: top + (SHOWN - 1 - d) * peek, scale: 1 - d * 0.05 };
  };

  const dismiss = (id: number) => {
    if (leaving !== null) return;
    setLeaving(id);
    window.setTimeout(() => {
      setStack((s) => {
        const rest = s.filter((t) => t.id !== id);
        const n = next.current++;
        const fresh = { ...POOL[n % POOL.length], id: n };
        return [fresh, ...rest];
      });
      setLeaving(null);
    }, 220);
  };

  const retry = (id: number) => {
    setStack((s) => s.map((t) => (t.id === id
      ? { ...t, kind: "success", title: "Checkpoint poussé", body: "Le Hub a bien reçu le fichier.", action: undefined }
      : t)));
  };

  return (
    <div
      ref={root}
      className="tst"
      role="region"
      aria-label="Notifications"
      data-open={open || undefined}
      style={{ width: W, height: FH, ["--tst-r" as string]: `${corner}px` } as CSSProperties}
      onPointerOver={() => setOpen(true)}
      onPointerOut={(e) => {
        const to = e.relatedTarget as Node | null;
        if (!to || !root.current?.contains(to)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      {stack.map((t, k) => {
        const Icon = ICON[t.kind];
        const out = leaving === t.id;
        const p = place(k);
        const front = k === 0;
        return (
          <motion.div
            key={t.id}
            className="tst-toast"
            data-kind={t.kind}
            data-front={front || undefined}
            style={{ height: H, zIndex: SHOWN - k }}
            /* a new one rises in from below the front */
            initial={{ y: place(0).y + 24, scale: 1, opacity: 0, x: 0 }}
            animate={out
              ? { y: p.y, scale: p.scale, opacity: 0, x: 60 }
              : { y: p.y, scale: p.scale, opacity: 1, x: 0 }}
            transition={out
              ? (still ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 1, 1] })
              : (still ? { duration: 0 } : SPRING)}
            aria-hidden={!open && !front ? true : undefined}
          >
            <span className="tst-icon"><Icon size={18} strokeWidth={2} aria-hidden="true" /></span>
            <span className="tst-text">
              <b>{t.title}</b>
              <span>{t.body}</span>
            </span>
            {t.action && (
              <button type="button" className="tst-act" tabIndex={open || front ? 0 : -1} onClick={() => retry(t.id)}>
                {t.action}
              </button>
            )}
            <button
              type="button"
              className="tst-x"
              aria-label={`Fermer ${t.title}`}
              tabIndex={open || front ? 0 : -1}
              onClick={() => dismiss(t.id)}
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
