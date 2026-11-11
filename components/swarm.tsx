"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ball, { type BallSpec } from "./ball";
import { readHintDismissed, writeHintDismissed } from "@/lib/live-store";
import { useLiveFeed } from "./live-provider";

interface Props {
  bots: BallSpec[];
  height?: number;
}

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** wander phases */
  p: number;
  q: number;
  /** next micro-impulse, in seconds of the animation clock */
  next: number;
  /** until when the creature is resting */
  rest: number;
};

const STATE_COLOR: Record<BallSpec["state"], string> = {
  working: "#34d399",
  idle: "#64708a",
  waiting: "#fbbf24",
  alert: "#fb7185",
};

const STATE_LABEL: Record<BallSpec["state"], string> = {
  working: "en action",
  idle: "en veille",
  waiting: "en attente",
  alert: "vigilance",
};

/**
 * The swarm — the mini-avatars, moving freely and in real time.
 *
 * The motion is a tiny physics loop (60 fps, positions written straight to
 * the DOM so React never re-renders): each ball wanders with its own
 * oscillation, repels its neighbours, avoids the pointer, bounces off the
 * edges, and can be **grabbed and thrown** with the mouse.
 *
 * Micro-activity is deliberate: every so often a creature gives itself a
 * small push ("dash"), then rests for a second or two; the body stretches
 * along its velocity; the eyes follow the pointer when it is there and
 * saccade on their own when it is not. None of it is decorative randomness
 * layered on top of the data — the *intensity* is read from each bot's state
 * (`working` moves more than `waiting`), and the data on each ball never
 * changes because of the animation.
 *
 * Two rules the swarm now follows:
 *
 * * the **legend** says what the colours mean, because a colour without a
 *   legend is decoration;
 * * when the OS asks for less motion, the physics stops: the creatures are
 *   laid out and stay there, and nothing is lost — their state is still
 *   written on their label.
 */
export default function Swarm({ bots, height = 340 }: Props) {
  const feed = useLiveFeed();
  const box = useRef<HTMLDivElement | null>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const pointer = useRef({ x: -9999, y: -9999, active: false });
  const dragging = useRef<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [, setTick] = useState(0);

  const parts = useRef<P[]>(
    bots.map((_, i) => ({
      x: 0.08 + ((i * 0.137) % 0.8),
      y: 0.12 + ((i * 0.211) % 0.7),
      vx: 0.02 * (i % 2 ? 1 : -1),
      vy: 0.015 * (i % 3 ? 1 : -1),
      p: Math.random() * 6.28,
      q: Math.random() * 6.28,
      next: 0,
      rest: 0,
    })),
  );

  // the hint is a one-time thing: once dismissed, it stays dismissed
  useEffect(() => {
    setHint(!readHintDismissed());
  }, []);

  // the clock of the activity meter
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  /**
   * The swarm's liveliness is a *measurement*: the number of values that
   * actually changed in the last minute. When the run writes, they move;
   * when nothing moves, they doze. The rate is read into a ref so the
   * physics loop never restarts (a restarted loop would freeze the motion).
   */
  const activityRef = useRef(0);
  const perMin = useMemo(() => {
    const now = Date.now();
    return feed.changes.filter((c) => now - c.t <= 60_000).length;
  }, [feed.changes]);
  activityRef.current = perMin;

  // the OS preference, watched live
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // keep the physics state in sync with the bot list
  useEffect(() => {
    if (parts.current.length !== bots.length) {
      parts.current = bots.map((_, i) => ({
        x: 0.08 + ((i * 0.137) % 0.8),
        y: 0.12 + ((i * 0.211) % 0.7),
        vx: 0.02 * (i % 2 ? 1 : -1),
        vy: 0.015 * (i % 3 ? 1 : -1),
        p: Math.random() * 6.28,
        q: Math.random() * 6.28,
        next: 0,
        rest: 0,
      }));
    }
  }, [bots.length]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const el = box.current;
      if (!el) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const W = el.clientWidth;
      const H = el.clientHeight;
      const P = parts.current;

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        const state = bots[i]?.state ?? "idle";
        // working bodies are livelier; waiting ones doze — and the whole
        // swarm is stirred by the *measured* activity of the run
        const base =
          state === "working" ? 1 : state === "alert" ? 0.85 : state === "waiting" ? 0.42 : 0.65;
        const activity = Math.min(1, activityRef.current / 6);
        const energy = base * (0.55 + 0.45 * activity);

        if (dragging.current === i) {
          // follow the pointer exactly
          const dx = pointer.current.x - p.x * W;
          const dy = pointer.current.y - p.y * H;
          p.vx = dx / Math.max(1, W);
          p.vy = dy / Math.max(1, H);
          p.x += dx / Math.max(1, W);
          p.y += dy / Math.max(1, H);
          p.x = Math.max(0.02, Math.min(0.98, p.x));
          p.y = Math.max(0.03, Math.min(0.97, p.y));
          continue;
        }

        // ---- micro-activity: a small dash, then a short rest ------------
        if (t > p.next) {
          p.next = t + 1.2 + Math.random() * 4.8;
          if (Math.random() < 0.62) {
            const a = Math.random() * Math.PI * 2;
            const kick = energy * (0.0011 + Math.random() * 0.0024);
            p.vx += Math.cos(a) * kick;
            p.vy += Math.sin(a) * kick;
            p.rest = t + 0.25 + Math.random() * 1.1;
          }
        }
        const resting = t < p.rest;

        // wander
        p.p += dt * (0.35 + (i % 5) * 0.07) * (0.6 + energy * 0.7);
        p.q += dt * (0.27 + (i % 3) * 0.09) * (0.6 + energy * 0.7);
        p.vx += Math.cos(p.p) * 0.0016 * dt * 60 * energy;
        p.vy += Math.sin(p.q) * 0.0016 * dt * 60 * energy;

        // separation from the neighbours
        for (let j = 0; j < P.length; j++) {
          if (j === i) continue;
          const dx = p.x - P[j].x;
          const dy = p.y - P[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.012 && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.vx += (dx / d) * 0.004 * dt * 60;
            p.vy += (dy / d) * 0.004 * dt * 60;
          }
        }

        // avoid the pointer
        if (pointer.current.active) {
          const dx = p.x * W - pointer.current.x;
          const dy = p.y * H - pointer.current.y;
          const d = Math.hypot(dx, dy);
          if (d < 120 && d > 0.01) {
            p.vx += (dx / d) * 0.010 * dt * 60;
            p.vy += (dy / d) * 0.010 * dt * 60;
          }
        }

        // damping + speed limit (resting creatures settle, they do not stop dead)
        p.vx *= resting ? 0.94 : 0.985;
        p.vy *= resting ? 0.94 : 0.985;
        const sp = Math.hypot(p.vx, p.vy);
        const max = 0.0022 * (resting ? 0.4 : energy);
        if (sp > max) {
          p.vx = (p.vx / sp) * max;
          p.vy = (p.vy / sp) * max;
        }

        p.x += p.vx;
        p.y += p.vy;

        // bounce
        let bounced = 0;
        if (p.x < 0.02) {
          p.x = 0.02;
          p.vx = Math.abs(p.vx);
          bounced = 1;
        }
        if (p.x > 0.98) {
          p.x = 0.98;
          p.vx = -Math.abs(p.vx);
          bounced = 1;
        }
        if (p.y < 0.04) {
          p.y = 0.04;
          p.vy = Math.abs(p.vy);
          bounced = 1;
        }
        if (p.y > 0.96) {
          p.y = 0.96;
          p.vy = -Math.abs(p.vy);
          bounced = 1;
        }

        const node = nodes.current[i];
        if (node) {
          node.style.transform = `translate3d(${(p.x * W).toFixed(1)}px, ${(
            p.y * H
          ).toFixed(1)}px, 0)`;
          // the depth: a creature far from the camera is smaller. It is the
          // arena's third dimension, made of one number.
          const depth = 0.78 + 0.34 * p.y;
          node.style.setProperty("--depth", depth.toFixed(3));
          // the body stretches along the movement — a slime in motion
          const sx = Math.max(-1, Math.min(1, p.vx * 420));
          const sy = Math.max(-1, Math.min(1, p.vy * 420));
          const squash = bounced ? 0.9 : 1;
          node.style.setProperty("--sx", `${(sx * 5.2 * squash).toFixed(1)}px`);
          node.style.setProperty("--sy", `${(sy * 5.2 * squash).toFixed(1)}px`);
          // eyes follow the pointer when it is over the box
          if (pointer.current.active) {
            const dx = (pointer.current.x - p.x * W) / Math.max(1, W);
            const dy = (pointer.current.y - p.y * H) / Math.max(1, H);
            node.style.setProperty(
              "--ex",
              `${(Math.max(-1, Math.min(1, dx * 6)) * 4.5).toFixed(1)}px`,
            );
            node.style.setProperty(
              "--ey",
              `${(Math.max(-1, Math.min(1, dy * 6)) * 3.2).toFixed(1)}px`,
            );
          } else {
            node.style.removeProperty("--ex");
            node.style.removeProperty("--ey");
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    // reduced motion: the creatures are placed, not animated. Their state is
    // still on their label — nothing measurable is lost.
    if (reduced) {
      const el = box.current;
      if (el) {
        const W = el.clientWidth;
        const H = el.clientHeight;
        parts.current.forEach((p, i) => {
          const node = nodes.current[i];
          if (!node) return;
          node.style.transform = `translate3d(${(p.x * W).toFixed(1)}px, ${(
            p.y * H
          ).toFixed(1)}px, 0)`;
        });
      }
      return;
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bots, reduced]);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    pointer.current = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      active: true,
    };
    setHint((h) => {
      if (h) {
        writeHintDismissed();
        return false;
      }
      return h;
    });
  }, []);

  const onLeave = useCallback(() => {
    pointer.current.active = false;
  }, []);

  const onDown = (i: number, e: React.PointerEvent) => {
    dragging.current = i;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelected(bots[i].id);
  };

  const onUp = () => {
    dragging.current = null;
  };

  const active = bots.find((b) => b.id === selected) ?? null;

  const counts = useMemo(() => {
    const c: Record<BallSpec["state"], number> = {
      working: 0,
      idle: 0,
      waiting: 0,
      alert: 0,
    };
    for (const b of bots) c[b.state] += 1;
    return c;
  }, [bots]);

  return (
    <div>
      {/* the legend — a colour without a legend is decoration */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
        {(Object.keys(STATE_LABEL) as BallSpec["state"][]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: STATE_COLOR[s] }}
            />
            {STATE_LABEL[s]}
            <span className="num text-dim">{counts[s]}</span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span
            className="flex items-center gap-1.5"
            title="valeurs réellement modifiées sur les 60 dernières secondes"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            activité mesurée
            <span className="num text-dim">{perMin}/min</span>
          </span>
          <span
            title="l'anneau autour de chaque créature porte son état ; l'arc porte sa mesure"
            className="hidden sm:inline"
          >
            anneau = état · arc = mesure
          </span>
          <span>
            {reduced
              ? "mouvements réduits — le système d'exploitation le demande"
              : "ils bougent parce que le run produit des mesures"}
          </span>
        </span>
      </div>

      <div
        ref={box}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerUp={onUp}
        className="relative w-full overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_50%_120%,rgba(56,189,248,0.07),transparent_60%)]"
        style={{ height }}
      >
        {/* a very quiet starfield — depth, not decoration in the way */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 12% 22%, rgba(148,197,255,.55) 50%, transparent 51%)," +
              "radial-gradient(1px 1px at 78% 33%, rgba(167,139,250,.5) 50%, transparent 51%)," +
              "radial-gradient(1px 1px at 35% 74%, rgba(148,197,255,.4) 50%, transparent 51%)," +
              "radial-gradient(1.5px 1.5px at 62% 82%, rgba(56,189,248,.4) 50%, transparent 51%)," +
              "radial-gradient(1px 1px at 88% 68%, rgba(255,255,255,.35) 50%, transparent 51%)",
            backgroundSize: "420px 260px",
            animation: reduced ? undefined : "drift 42s linear infinite",
          }}
        />

        {/* the radar: concentric rings and a slow sweep — the map of the crew */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {[14, 26, 38, 50].map((r) => (
            <ellipse
              key={r}
              cx="50"
              cy="50"
              rx={r}
              ry={r * 0.72}
              fill="none"
              stroke="rgba(148,197,255,.07)"
              strokeWidth="0.2"
            />
          ))}
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="rgba(148,197,255,.05)"
            strokeWidth="0.2"
          />
          <line
            x1="50"
            y1="0"
            x2="50"
            y2="100"
            stroke="rgba(148,197,255,.05)"
            strokeWidth="0.2"
          />
        </svg>

        {/* the floor: an ellipse that gives the arena a ground */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]"
          style={{
            background:
              "radial-gradient(ellipse 70% 100% at 50% 100%, rgba(56,189,248,.10), transparent 70%)",
          }}
        />
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] w-full"
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          aria-hidden
        >
          <ellipse
            cx="50"
            cy="28"
            rx="46"
            ry="9"
            fill="none"
            stroke="rgba(148,197,255,.10)"
            strokeWidth="0.4"
          />
          <ellipse
            cx="50"
            cy="28"
            rx="28"
            ry="5.4"
            fill="none"
            stroke="rgba(148,197,255,.07)"
            strokeWidth="0.4"
          />
        </svg>

        {/* the vignette: the arena's edges fall into the dark */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(4,6,10,.55) 100%)",
          }}
        />

        {bots.map((b, i) => (
          <div
            key={b.id}
            ref={(el) => {
              nodes.current[i] = el;
            }}
            className="absolute left-0 top-0 cursor-grab select-none will-change-transform active:cursor-grabbing transition-opacity duration-300"
            style={{
              transform: "translate3d(0,0,0)",
              opacity: selected && selected !== b.id ? 0.45 : 1,
            }}
            onPointerDown={(e) => onDown(i, e)}
          >
            <div
              style={{
                transform: "scale(var(--depth, 1))",
                transformOrigin: "23px 26px",
              }}
            >
              <Ball
                bot={b}
                size={46}
                selected={b.id === selected}
                active={b.state === "working"}
              />
            </div>
            {/* the label is a pill: the state is readable without the face */}
            <div className="pointer-events-none absolute left-1/2 top-[52px] -translate-x-1/2">
              <div className="flex w-max max-w-[150px] items-center gap-1 rounded-full border border-line/80 bg-[#0a0d13]/85 px-1.5 py-[1px] backdrop-blur">
                <span
                  className="h-1 w-1 shrink-0 rounded-full"
                  style={{ background: STATE_COLOR[b.state] }}
                />
                <span className="truncate text-[9.5px] font-medium text-ink">
                  {b.name}
                </span>
              </div>
              <div className="mt-0.5 w-max max-w-[150px] truncate text-center text-[8.5px] leading-tight text-faint">
                {b.role}
              </div>
            </div>
          </div>
        ))}

        {hint ? (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel2/80 px-3 py-1 text-[10px] text-faint backdrop-blur">
            les avatars se déplacent seuls — attrape-les et lance-les
          </div>
        ) : null}
      </div>

      {active ? (
        <div className="card mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Ball bot={active} size={44} />
              <div>
                <div className="text-[13px] text-ink">{active.name}</div>
                <div className="text-[10.5px] text-faint">{active.role}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="chip hover:text-ink">
              fermer ✕
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10.5px]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: STATE_COLOR[active.state] }}
            />
            <span className="text-dim">{STATE_LABEL[active.state]}</span>
            {active.progress !== null ? (
              <span className="num text-faint">
                · {(active.progress * 100).toFixed(1)} %
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
            Il bouge parce que son état est « {STATE_LABEL[active.state]} » et
            que le run a produit <span className="num text-dim">{perMin}</span>{" "}
            changements mesurés sur la dernière minute. La vitesse de
            l&apos;essaim n&apos;est pas une animation libre : elle suit
            l&apos;activité réelle.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed whitespace-pre-wrap text-dim">
            {active.detail}
          </p>
          <p className="mt-2 font-mono text-[10px] text-faint">
            source : {active.source}
          </p>
        </div>
      ) : null}

      <style>{`
        @keyframes drift {
          from { background-position: 0 0, 0 0, 0 0, 0 0, 0 0; }
          to   { background-position: 420px 260px, 420px 260px, 420px 260px, 420px 260px, 420px 260px; }
        }
      `}</style>
    </div>
  );
}
