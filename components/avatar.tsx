"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mood = "idle" | "focus" | "hot" | "stalled" | "done";

interface Props {
  mood: Mood;
  /** 0..1 — used for the eye pupils and the ring */
  intensity?: number;
  label?: string;
  caption?: string;
  /** the measured cadence, in s/step — the rings turn at this speed */
  pace?: number | null;
  /** the age of the signal, in seconds */
  ageS?: number | null;
  /** 0..1 — the share of the run that is done, drawn as the outer arc */
  percent?: number | null;
  /** the measured activity of the run (changes per minute) */
  activity?: number | null;
  /** where the pointer is, in [-1, 1] — the core looks at it */
  gaze?: { x: number; y: number };
}

const MOOD = {
  idle: { core: "#38bdf8", edge: "#0ea5e9", hot: "#7dd3fc" },
  focus: { core: "#38bdf8", edge: "#6366f1", hot: "#a78bfa" },
  hot: { core: "#f97316", edge: "#fb7185", hot: "#fbbf24" },
  stalled: { core: "#fbbf24", edge: "#f59e0b", hot: "#fde68a" },
  done: { core: "#34d399", edge: "#10b981", hot: "#6ee7b7" },
} as const;

/**
 * The run's avatar — a **planet**, seen in 3D.
 *
 * It is a sphere with a light that does not move: a body gradient lit from
 * the upper left, a terminator that darkens the lower right, a rim light
 * catching the far edge, and a specular hotspot. The whole body then turns
 * in real 3D (CSS `perspective` + `rotateY`), so the aurora inside slides
 * across the surface and the highlights travel — the difference between a
 * solid and a sticker.
 *
 * Every layer is bound to a measurement:
 *
 * * the **arc** around it is the run's completion (`percent`);
 * * the **rings** turn at `3 + 3,4 × cadence` seconds — a run that slows
 *   down is *visible* as slower rings;
 * * the **particles** are the measured activity (changes per minute): no
 *   activity, no particles;
 * * the **core** breathes with the log's cadence, and its colour is the mood;
 * * the **haze** appears when the card is thermally limited.
 *
 * And the caption says which number the animation is reading: an animation
 * whose meaning is not written down is decoration.
 */
export default function Avatar({
  mood,
  intensity = 0.5,
  label,
  caption,
  pace = null,
  ageS = null,
  percent = null,
  activity = null,
  gaze = { x: 0, y: 0 },
}: Props) {
  const [blink, setBlink] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  // the core follows the pointer: the orb is not a picture, it looks at you
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPointer({
        x: ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2,
        y: ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2,
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        loop();
      }, 2500 + Math.random() * 4500);
    };
    loop();
    return () => window.clearTimeout(t);
  }, []);

  const c = MOOD[mood];
  const R = 240;
  const C = R / 2;

  // one turn of the rings = 3 s + 3,4 s per s/step of the measured cadence
  const spinS = pace && pace > 0 ? Math.min(26, 3 + pace * 3.4) : mood === "hot" ? 6 : 16;
  // the core beats with the log: 10 steps × cadence
  const beatS = pace && pace > 0 ? Math.min(9, Math.max(1.4, pace * 2.6)) : 1.8;
  // the particles are the measured activity
  const nParticles = Math.max(0, Math.min(9, Math.round((activity ?? 0) / 2)));

  const arc = useMemo(() => {
    const p = Math.max(0, Math.min(1, percent ?? intensity));
    const circ = 2 * Math.PI * 96;
    return { len: circ * p, circ };
  }, [percent, intensity]);

  const eyeX = Math.max(-1, Math.min(1, gaze.x || pointer.x)) * 4.5;
  const eyeY = Math.max(-1, Math.min(1, gaze.y || pointer.y)) * 3.4;
  const tiltX = Math.max(-16, Math.min(16, (gaze.y || pointer.y) * 7));
  const tiltY = Math.max(-16, Math.min(16, (gaze.x || pointer.x) * 9));

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        ref={boxRef}
        className="relative h-[176px] w-[176px] shrink-0"
        style={{ perspective: 900 }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            transform: `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`,
            transition: "transform 700ms cubic-bezier(.22,1,.36,1)",
          }}
        >
          {/* the body turns on its own axis: the aurora slides across it */}
          <div
            className="h-full w-full"
            style={{
              transformStyle: "preserve-3d",
              animation: `planetSpin ${(spinS * 2.4).toFixed(1)}s linear infinite`,
            }}
          >
            <svg viewBox={`0 0 ${R} ${R}`} className="h-full w-full overflow-visible">
              <defs>
                {/* the sphere: lit from the upper left */}
                <radialGradient id="av-body" cx="33%" cy="25%" r="82%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
                  <stop offset="16%" stopColor={c.hot} stopOpacity="0.85" />
                  <stop offset="46%" stopColor={c.core} stopOpacity="0.72" />
                  <stop offset="80%" stopColor={c.edge} stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#04060b" stopOpacity="0.85" />
                </radialGradient>
                {/* the terminator */}
                <radialGradient id="av-term" cx="30%" cy="22%" r="88%">
                  <stop offset="40%" stopColor="#000" stopOpacity="0" />
                  <stop offset="76%" stopColor="#000" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.72" />
                </radialGradient>
                {/* the rim light on the far edge */}
                <linearGradient id="av-rim" x1="1" y1="1" x2="0.2" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                  <stop offset="28%" stopColor={c.hot} stopOpacity="0.35" />
                  <stop offset="70%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="av-arc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={c.core} />
                  <stop offset="100%" stopColor={c.edge} />
                </linearGradient>
                <radialGradient id="av-halo" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={c.core} stopOpacity="0.4" />
                  <stop offset="58%" stopColor={c.core} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={c.core} stopOpacity="0" />
                </radialGradient>
                <filter id="av-blur" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="15" />
                </filter>
                <filter id="av-soft" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="5" />
                </filter>
                <clipPath id="av-clip">
                  <circle cx={C} cy={C} r="74" />
                </clipPath>
              </defs>

              {/* the halo — the light the planet casts around itself */}
              <circle cx={C} cy={C} r="112" fill="url(#av-halo)" />

              {/* the aurora inside the sphere: three blurred blobs that drift */}
              <g clipPath="url(#av-clip)">
                <circle
                  cx="92"
                  cy="96"
                  r="46"
                  fill={c.core}
                  filter="url(#av-blur)"
                  style={{
                    animation: "avDrift1 11s ease-in-out infinite",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                />
                <circle
                  cx="150"
                  cy="126"
                  r="38"
                  fill={c.edge}
                  filter="url(#av-blur)"
                  style={{
                    animation: "avDrift2 14s ease-in-out infinite",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                />
                <circle
                  cx="118"
                  cy="76"
                  r="30"
                  fill={c.hot}
                  filter="url(#av-blur)"
                  style={{
                    animation: "avDrift3 17s ease-in-out infinite",
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                />
              </g>

              {/* the solid: body + terminator + rim + specular */}
              <circle cx={C} cy={C} r="74" fill="url(#av-body)" />
              <circle cx={C} cy={C} r="74" fill="url(#av-term)" />
              <path
                d="M 56 176 A 74 74 0 0 0 186 108"
                fill="none"
                stroke="url(#av-rim)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <ellipse
                cx="96"
                cy="86"
                rx="22"
                ry="12"
                fill="#ffffff"
                opacity="0.5"
                filter="url(#av-soft)"
                transform="rotate(-28 96 86)"
              />
              <ellipse
                cx="88"
                cy="78"
                rx="9"
                ry="5"
                fill="#ffffff"
                opacity="0.55"
                transform="rotate(-28 88 78)"
              />

              {/* the orbital rings — their speed is the cadence */}
              <g
                style={{
                  transformOrigin: `${C}px ${C}px`,
                  transformBox: "view-box",
                  animation: `spin ${spinS.toFixed(1)}s linear infinite`,
                }}
              >
                <ellipse
                  cx={C}
                  cy={C}
                  rx="96"
                  ry="34"
                  fill="none"
                  stroke={c.core}
                  strokeOpacity="0.32"
                  strokeWidth="1"
                  strokeDasharray="3 9"
                  transform={`rotate(-16 ${C} ${C})`}
                />
              </g>
              <g
                style={{
                  transformOrigin: `${C}px ${C}px`,
                  transformBox: "view-box",
                  animation: `spin ${(spinS * 1.6).toFixed(1)}s linear infinite reverse`,
                }}
              >
                <ellipse
                  cx={C}
                  cy={C}
                  rx="88"
                  ry="44"
                  fill="none"
                  stroke={c.edge}
                  strokeOpacity="0.2"
                  strokeWidth="1"
                  strokeDasharray="2 12"
                  transform={`rotate(22 ${C} ${C})`}
                />
              </g>
            </svg>
          </div>

          {/* the flat layer: the progress arc and the core, always readable */}
          <svg
            viewBox={`0 0 ${R} ${R}`}
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <radialGradient id="av-core" cx="42%" cy="36%" r="62%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="35%" stopColor={c.hot} stopOpacity="0.9" />
                <stop offset="100%" stopColor={c.core} stopOpacity="0.55" />
              </radialGradient>
              <linearGradient id="av-arc2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={c.core} />
                <stop offset="100%" stopColor={c.edge} />
              </linearGradient>
              <filter id="av-soft2" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            {/* the progress arc — the only number the orb carries */}
            <circle
              cx={C}
              cy={C}
              r="96"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.07"
              strokeWidth="2.5"
            />
            {percent !== null ? (
              <circle
                cx={C}
                cy={C}
                r="96"
                fill="none"
                stroke="url(#av-arc2)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${arc.len} ${arc.circ}`}
                transform={`rotate(-90 ${C} ${C})`}
                style={{ transition: "stroke-dasharray 700ms ease-out" }}
              />
            ) : null}

            {/* the particles: the measured activity, one dot per change pair */}
            <g
              style={{
                transformOrigin: `${C}px ${C}px`,
                transformBox: "view-box",
                animation: `spin ${(spinS * 0.8).toFixed(1)}s linear infinite`,
              }}
            >
              {Array.from({ length: nParticles }).map((_, i) => {
                const a = (i / Math.max(1, nParticles)) * Math.PI * 2;
                const r = 106;
                return (
                  <circle
                    key={i}
                    cx={C + Math.cos(a) * r}
                    cy={C + Math.sin(a) * r * 0.92}
                    r={2.4 - i * 0.12}
                    fill={c.hot}
                    opacity={0.75 - i * 0.04}
                  />
                );
              })}
            </g>

            {/* the heat haze when the card is thermally limited */}
            {mood === "hot" ? (
              <g opacity="0.5">
                {[0, 1, 2, 3].map((i) => (
                  <path
                    key={i}
                    d={`M ${44 + i * 40} 196 q 6 -9 0 -18 q -6 -9 0 -18`}
                    stroke="#f97316"
                    strokeWidth="1.4"
                    fill="none"
                    style={{
                      animation: `avHaze ${(1.4 + i * 0.3).toFixed(1)}s ease-in-out infinite`,
                      transformBox: "fill-box",
                      transformOrigin: "center",
                    }}
                  />
                ))}
              </g>
            ) : null}
          </svg>

          {/* the core, in front: it breathes and looks at the pointer */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${eyeX}px, ${eyeY}px)`,
              transition: "transform 700ms cubic-bezier(.4,0,.2,1)",
            }}
          >
            <div
              className="h-[30px] w-[30px] rounded-full"
              style={{
                background: `radial-gradient(circle at 42% 36%, #ffffff, ${c.hot} 38%, ${c.core} 78%)`,
                boxShadow: `0 0 26px -6px ${c.core}, 0 0 60px -20px ${c.hot}`,
                animation: `avBeat ${beatS.toFixed(1)}s ease-in-out infinite`,
                opacity: blink ? 0.5 : 0.95,
              }}
            />
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="pulse" style={{ background: c.core }} />
          <span className="text-[12px] font-medium text-ink">{label ?? "Avatar"}</span>
          {percent !== null ? (
            <span className="num text-[11px] text-faint">
              {(percent * 100).toFixed(1)} %
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{caption}</p>
        {/* what the animation is reading — an animation whose meaning is not
            written down is decoration */}
        <p className="mt-2 border-l border-line pl-2.5 text-[10px] leading-relaxed text-faint">
          l&apos;anneau fait un tour en{" "}
          <span className="num text-dim">{spinS.toFixed(1)} s</span>
          {pace ? (
            <>
              {" "}
              (cadence mesurée{" "}
              <span className="num text-dim">{pace.toFixed(2)} s/step</span>)
            </>
          ) : null}
          ; le noyau bat toutes les{" "}
          <span className="num text-dim">{beatS.toFixed(1)} s</span>
          {activity !== null ? (
            <>
              {" "}
              ; <span className="num text-dim">{activity}</span> particules
              suivent l&apos;activité mesurée
            </>
          ) : null}
          {ageS !== null ? (
            <>
              {" "}
              ; le signal a{" "}
              <span className="num text-dim">{Math.round(ageS)} s</span>
            </>
          ) : null}
          .
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes planetSpin { to { transform: rotateY(360deg); } }
        @keyframes avBeat {
          0%, 100% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes avDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(14px, -10px) scale(1.12); }
        }
        @keyframes avDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1.05); }
          50% { transform: translate(-16px, 8px) scale(0.92); }
        }
        @keyframes avDrift3 {
          0%, 100% { transform: translate(0, 0) scale(0.9); }
          50% { transform: translate(8px, 12px) scale(1.18); }
        }
        @keyframes avHaze {
          0%   { transform: translateY(0); opacity: 0; }
          25%  { opacity: 0.8; }
          100% { transform: translateY(-10px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
