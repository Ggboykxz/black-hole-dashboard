"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { buildAlerts } from "@/lib/alerts";
import type { Snapshot } from "@/lib/types";
import { useLiveFeed } from "./live-provider";

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
type Toast = {
  id: string | number;
  kind: Kind;
  title: string;
  body: string;
  /** label of the small button */
  action?: string;
  /** the shell command the button copies */
  command?: string;
};

const ICON: Record<Kind, LucideIcon> = {
  success: CircleCheck,
  info: Info,
  error: CircleX,
  warning: TriangleAlert,
};

/* ── le filet, quand la course n'a encore rien à dire ───────────────────
   La pile était alimentée par un pool de démonstration, dont un
   « Push du checkpoint refusé » : pendant que les pushes réussis-
   saient, le site affichait en permanence un échec qui n'avait pas
   eu lieu. Une fausse alerte est pire que pas d'alerte — elle
   apprend à lire les vraies. Ce filet ne dit que des faits vérifiables
   sur la page. */
const POOL: Toast[] = [
  { id: "filet-ecriture", kind: "info", title: "Le direct écrit", body: "Le producteur écrit dans le log toutes les ~10 s." },
  { id: "filet-source", kind: "info", title: "Même source que la doc", body: "Le dashboard lit les artefacts, il ne les recalcule pas." },
  { id: "filet-rien", kind: "info", title: "Rien à signaler", body: "Aucune alerte active sur ce run." },
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
  snapshot,
}: {
  peek?: number;
  gap?: number;
  /* 18 = le rayon des cartes du dashboard (globals.css `.card`), pas les
     20 px de la référence — c'est le mapping de --tst-r */
  corner?: number;
  /* l'instantané du run : il donne les faits (mesure, checkpoint) que
     la pile affiche quand aucune alerte n'est active */
  snapshot?: Snapshot;
}) {
  const feed = useLiveFeed();

  /* ── ce que la pile affiche : les faits, pas une démonstration ──────
     Les alertes viennent des mêmes règles que le centre de
     notifications (une GPU bridée, un signal figé, une documentation
     en retard) ; les deux faits de repli — la dernière mesure
     officielle et le dernier checkpoint — sont lus dans
     l'instantané. Tant qu'aucune mesure n'est arrivée, la pile
     reste sur son filet neutre : annoncer « push refusé » pendant
     que les pushes réussissent apprend à ignorer les alertes. */
  const items = useMemo<Toast[]>(() => {
    const out: Toast[] = [];
    if (feed.verified && feed.live && snapshot) {
      for (const a of buildAlerts(feed.live, snapshot)) {
        out.push({
          id: a.id,
          kind: a.level === "critical" ? "error" : a.level === "warn" ? "warning" : "info",
          title: a.title,
          body: a.detail,
          action: a.action ? "copier" : undefined,
          command: a.action,
        });
      }
      const bench = snapshot.benchmarks[snapshot.benchmarks.length - 1];
      if (bench) {
        out.push({
          id: "bench",
          kind: "success",
          title: "Mesure officielle",
          body: `bench ${bench.loss.toFixed(4)} @ ${bench.step} — protocole fixe, étiqueté à son step.`,
        });
      }
      const ckpt = snapshot.checkpoints[snapshot.checkpoints.length - 1];
      if (ckpt) {
        out.push({
          id: "checkpoint",
          kind: "success",
          title: "Checkpoint écrit",
          body: `${ckpt.name} — étape ${ckpt.step}, ${ckpt.size_gb.toFixed(2)} Go.`,
        });
      }
    }
    return out;
  }, [feed.live, feed.verified, snapshot]);

  /* front first; ids count up so a returning toast is a new element */
  const [stack, setStack] = useState<Toast[]>(() =>
    (items.length ? items : POOL).slice(0, SHOWN).map((t, i) => ({ ...t, id: t.id ?? i })),
  );
  const [leaving, setLeaving] = useState<string | number | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const still = useReducedMotion();

  /* la pile suit les faits : ce qui arrive devient le front, ce qui
     disparaît s'en va, ce qui reste ne bouge pas. */
  const signature = (items ?? []).map((i) => `${i.id}:${i.title}`).join("|");
  useEffect(() => {
    const source = items.length ? items : POOL;
    setStack((s) => {
      const kept = s.filter((t) => source.some((src) => src.id === t.id));
      const fresh = source
        .filter((src) => !kept.some((t) => t.id === src.id))
        .slice(0, SHOWN)
        .map((src) => ({ ...src }));
      const merged = [...fresh, ...kept].slice(0, SHOWN);
      return merged.length ? merged : s;
    });
  }, [signature]);

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

  const dismiss = (id: string | number) => {
    if (leaving !== null) return;
    setLeaving(id);
    window.setTimeout(() => {
      setStack((s) => s.filter((t) => t.id !== id));
      setLeaving(null);
    }, 220);
  };

  /* le bouton d'action ne ment plus : il copie la commande de
     l'alerte (celle que le panneau santé affiche en clair) au lieu
     de rejouer un succès inventé. */
  const [copied, setCopied] = useState<string | number | null>(null);
  const copy = async (t: Toast) => {
    if (!t.command) return;
    try {
      await navigator.clipboard.writeText(t.command);
      setCopied(t.id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* the clipboard may be refused — the command stays visible in
         the notification centre, where it is written out in full */
    }
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
              <button type="button" className="tst-act" tabIndex={open || front ? 0 : -1} onClick={() => copy(t)}>
                {copied === t.id ? "copié" : t.action}
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
