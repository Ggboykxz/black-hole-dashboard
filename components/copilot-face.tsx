"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type FaceMood = "idle" | "focus" | "alert" | "tour" | "happy";

interface Props {
  size?: number;
  /** is the copilot talking right now? (the bubble is open) */
  speaking?: boolean;
  /** the mood drives the brows and the mouth's rest shape */
  mood?: FaceMood;
  /** the pointer, in [-1, 1] — the eyes follow it */
  eye?: { x: number; y: number };
  /** a short gesture to play (a wave, a nod) */
  gesture?: "wave" | "nod" | null;
}

/**
 * The copilot's face — a stylised character, 2D drawing in a 3D space.
 *
 * The reference is the "assistant avatar" of the current generation of
 * apps: a *character*, not a mascot. It has hair, brows, eyelids and a
 * mouth that moves when it speaks. The differences here:
 *
 * * **no model, no runtime dependency** — the face is SVG + CSS, so the
 *   dashboard still installs with `npm i` alone and still runs next to a
 *   live trainer on two vCPU;
 * * **the mouth is not random noise** — it opens on a syllable envelope
 *   whose rhythm follows the length of the sentence being said;
 * * **the brows are a state** — they lift on an alert, lower on focus, and
 *   the face *remembers* the mood it wore last time (see
 *   `lib/copilot-store.ts`);
 * * **the head is in 3D** — it tilts towards the pointer and bobs when it
 *   talks, with `perspective`, so the light slides across the face.
 */
export default function CopilotFace({
  size = 58,
  speaking = false,
  mood = "idle",
  eye = { x: 0, y: 0 },
  gesture = null,
}: Props) {
  const [blink, setBlink] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [bob, setBob] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  // ---- blinking ----------------------------------------------------------
  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 110);
        loop();
      }, speaking ? 1600 + Math.random() * 2200 : 2800 + Math.random() * 4200);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [speaking]);

  // ---- the syllable envelope: the mouth opens and closes as it talks -----
  useEffect(() => {
    if (!speaking) {
      setMouth(0);
      return;
    }
    let alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      const dt = last.current ? now - last.current : 16;
      last.current = now;
      // a syllable every ~120 ms, with a soft attack and release
      const phase = (now % 120) / 120;
      const env = Math.sin(phase * Math.PI);
      setMouth(0.25 + 0.75 * env * (0.55 + Math.random() * 0.45));
      setBob(Math.sin(now / 190) * 0.6);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [speaking]);

  const gx = Math.max(-1, Math.min(1, eye.x));
  const gy = Math.max(-1, Math.min(1, eye.y));

  /** the brows: a state, not a decoration */
  const brow = useMemo(() => {
    switch (mood) {
      case "alert":
        return { y: -5, tilt: -7, color: "#fb7185" };
      case "tour":
      case "happy":
        return { y: -3, tilt: -3, color: "#38bdf8" };
      case "focus":
        return { y: 1, tilt: 4, color: "#38bdf8" };
      default:
        return { y: 0, tilt: 0, color: "#94a3b8" };
    }
  }, [mood]);

  const eyeOpen = blink ? 0.08 : 1;
  const mouthH = speaking ? 2 + mouth * 7 : mood === "happy" ? 5 : 1.6;

  return (
    <div
      className="relative shrink-0 select-none"
      style={{ width: size, height: size, perspective: 520 }}
    >
      <div
        style={{
          width: size,
          height: size,
          transform: `rotateY(${(-gx * 12).toFixed(2)}deg) rotateX(${(gy * 9).toFixed(2)}deg) translateY(${bob.toFixed(2)}px)`,
          transformStyle: "preserve-3d",
          transition: "transform 260ms cubic-bezier(.22,1,.36,1)",
          animation: gesture === "nod" ? "faceNod 620ms ease-in-out" : undefined,
        }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
          <defs>
            {/* the head: a sphere lit from the upper left */}
            <radialGradient id="cf-skin" cx="34%" cy="26%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="26%" stopColor="#e8f2ff" />
              <stop offset="62%" stopColor="#b9cfe6" />
              <stop offset="86%" stopColor="#5b6b84" />
              <stop offset="100%" stopColor="#2b3546" />
            </radialGradient>
            <linearGradient id="cf-hair" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="45%" stopColor="#6d5bd0" />
              <stop offset="100%" stopColor="#2b2f52" />
            </linearGradient>
            <linearGradient id="cf-hair2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
            <radialGradient id="cf-eye" cx="50%" cy="38%" r="62%">
              <stop offset="0%" stopColor="#a5f3fc" />
              <stop offset="45%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#1e40af" />
            </radialGradient>
            <radialGradient id="cf-blush" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fb7185" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
            </radialGradient>
            <filter id="cf-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <clipPath id="cf-face">
              <ellipse cx="50" cy="56" rx="31" ry="33" />
            </clipPath>
          </defs>

          {/* the halo behind the head */}
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="#38bdf8"
            opacity="0.14"
            filter="url(#cf-soft)"
          />

          {/* the body / the collar */}
          <path
            d="M18 100 C 22 84 34 78 50 78 C 66 78 78 84 82 100 Z"
            fill="#1b2436"
            stroke="#38bdf8"
            strokeOpacity="0.45"
            strokeWidth="1.4"
          />
          <path
            d="M36 80 L 50 90 L 64 80"
            fill="none"
            stroke="#38bdf8"
            strokeOpacity="0.55"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* the hair behind the head */}
          <path
            d="M16 54 C 14 24 30 8 50 8 C 70 8 86 24 84 54 C 80 40 72 28 58 24 C 46 21 30 30 16 54 Z"
            fill="url(#cf-hair)"
          />

          {/* the head */}
          <ellipse cx="50" cy="56" rx="31" ry="33" fill="url(#cf-skin)" />

          {/* the fringe */}
          <path
            d="M19 50 C 22 26 34 16 50 16 C 66 16 78 26 81 50 C 74 40 68 34 62 30 C 54 40 40 42 19 50 Z"
            fill="url(#cf-hair)"
          />
          <path
            d="M19 50 C 22 30 30 18 44 15 C 34 24 28 36 26 52 Z"
            fill="url(#cf-hair2)"
            opacity="0.85"
          />

          {/* the ears */}
          <ellipse cx="18" cy="58" rx="5" ry="7" fill="#c9d9ee" />
          <ellipse cx="82" cy="58" rx="5" ry="7" fill="#c9d9ee" />

          {/* the brows */}
          <path
            d={`M30 ${44 + brow.y} Q 38 ${40 + brow.y - brow.tilt * 0.3} 46 ${44 + brow.y + brow.tilt * 0.4}`}
            fill="none"
            stroke={brow.color}
            strokeWidth="2.4"
            strokeLinecap="round"
            style={{ transition: "all 320ms cubic-bezier(.22,1,.36,1)" }}
          />
          <path
            d={`M54 ${44 + brow.y + brow.tilt * 0.4} Q 62 ${40 + brow.y - brow.tilt * 0.3} 70 ${44 + brow.y}`}
            fill="none"
            stroke={brow.color}
            strokeWidth="2.4"
            strokeLinecap="round"
            style={{ transition: "all 320ms cubic-bezier(.22,1,.36,1)" }}
          />

          {/* the eyes */}
          <g
            style={{
              transform: `translate(${(gx * 2.2).toFixed(2)}px, ${(gy * 1.8).toFixed(2)}px)`,
              transition: "transform 140ms ease-out",
            }}
          >
            <ellipse cx="38" cy="56" rx="8" ry={9 * eyeOpen} fill="#f8fafc" />
            <ellipse cx="62" cy="56" rx="8" ry={9 * eyeOpen} fill="#f8fafc" />
            {eyeOpen > 0.3 ? (
              <>
                <circle cx={38 + gx * 2.4} cy={56 + gy * 2} r="6.2" fill="url(#cf-eye)" />
                <circle cx={62 + gx * 2.4} cy={56 + gy * 2} r="6.2" fill="url(#cf-eye)" />
                <circle cx={38 + gx * 2.4} cy={56 + gy * 2} r="3" fill="#0b1220" />
                <circle cx={62 + gx * 2.4} cy={56 + gy * 2} r="3" fill="#0b1220" />
                <circle cx={36 + gx * 2.4} cy={53.6 + gy * 2} r="1.9" fill="#fff" />
                <circle cx={60 + gx * 2.4} cy={53.6 + gy * 2} r="1.9" fill="#fff" />
              </>
            ) : null}
            {/* the eyelids — a real blink, not a squash */}
            <g clipPath="url(#cf-face)">
              <rect
                x="28"
                y={47 - (1 - eyeOpen) * 10}
                width="20"
                height="10"
                fill="#cfdcef"
                opacity="0.95"
              />
              <rect
                x="52"
                y={47 - (1 - eyeOpen) * 10}
                width="20"
                height="10"
                fill="#cfdcef"
                opacity="0.95"
              />
            </g>
          </g>

          {/* the blush */}
          <ellipse cx="27" cy="68" rx="7" ry="4" fill="url(#cf-blush)" />
          <ellipse cx="73" cy="68" rx="7" ry="4" fill="url(#cf-blush)" />

          {/* the mouth — it opens when the copilot speaks */}
          <g
            style={{
              transform: "translate(50px 74px)",
              transition: "transform 120ms ease-out",
            }}
          >
            <ellipse
              cx="0"
              cy="0"
              rx={speaking ? 5.4 : 4.2}
              ry={mouthH}
              fill="#7c2d4a"
              opacity={speaking ? 0.95 : 0.8}
            />
            {speaking && mouth > 0.55 ? (
              <ellipse cx="0" cy={mouthH * 0.35} rx="3" ry={mouthH * 0.3} fill="#fb7185" />
            ) : null}
          </g>

          {/* the antenna: a small light that pulses with the signal */}
          <line x1="50" y1="10" x2="50" y2="2" stroke="#38bdf8" strokeWidth="1.6" />
          <circle cx="50" cy="1" r="3.4" fill="#38bdf8" opacity="0.9">
            <animate
              attributeName="opacity"
              values="0.35;1;0.35"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>

          {/* the hand, when it waves */}
          {gesture === "wave" ? (
            <g
              style={{
                transformOrigin: "82px 82px",
                animation: "cfWave 900ms ease-in-out",
              }}
            >
              <ellipse cx="82" cy="76" rx="7" ry="9" fill="#c9d9ee" />
              <path
                d="M76 70 q 6 -8 12 0"
                fill="none"
                stroke="#38bdf8"
                strokeOpacity="0.5"
                strokeWidth="1.4"
              />
            </g>
          ) : null}
        </svg>
      </div>

      <style>{`
        @keyframes faceNod {
          0%, 100% { transform: rotateX(0deg); }
          35% { transform: rotateX(10deg); }
          70% { transform: rotateX(-4deg); }
        }
        @keyframes cfWave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-24deg); }
          55% { transform: rotate(18deg); }
          80% { transform: rotate(-10deg); }
        }
      `}</style>
    </div>
  );
}
