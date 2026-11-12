"use client";

import { useEffect, useRef, useState } from "react";

export interface BallSpec {
  id: string;
  name: string;
  role: string;
  state: "working" | "idle" | "waiting" | "alert";
  progress: number | null;
  color: string;
  headline: string;
  detail: string;
  source: string;
}

interface Props {
  bot: BallSpec;
  size?: number;
  /** the cursor direction, in [-1, 1] — the eyes follow it */
  eye?: { x: number; y: number };
  selected?: boolean;
  /** the drag velocity, in [-1, 1] — the body stretches along it */
  stretch?: { x: number; y: number };
  /** the bots that are working get sparkles */
  active?: boolean;
}

/** The colour of a state — the same vocabulary everywhere in the UI. */
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
 * The emblem each actor wears on its chest — so the avatar *names* the
 * actor it stands for. A sprite without an identity is a mascot.
 */
export const EMBLEM: Record<string, string> = {
  trainer: "≡",
  watchdog: "↻",
  keepalive: "⟳",
  heartbeat: "∿",
  auditor: "✓",
  measure: "⌗",
  ledger: "∑",
  predictor: "◇",
  samples: "✎",
  doc: "✎",
};

/**
 * A bot-minion: a little automaton, lit like a solid.
 *
 * It is a **sprite**, not a blob: a head with a glass visor and two glowing
 * eyes, a torso with a screen that shows the bot's *own* measurement, two
 * arms that swing with its activity, legs, and an antenna whose light
 * pulses at the run's cadence. On its chest it wears the **emblem of its
 * actor** (the trainer wears the log lines, the auditor the check mark,
 * the measurer the caliper…) — the avatar names the actor it stands for.
 *
 * The light is a real 3D light: the body is shaded from the upper left, the
 * terminator darkens the lower right, the rim catches the far edge, and the
 * whole sprite tilts in space when it is grabbed — so the highlights slide
 * the way they do on a physical object.
 *
 * Everything it shows is still a measurement: the colour is the bot's
 * domain, the screen is its progress, the halo is its state, the eyes
 * follow the pointer.
 */
export default function Ball({
  bot,
  size = 56,
  eye = { x: 0, y: 0 },
  selected = false,
  stretch = { x: 0, y: 0 },
  active = true,
}: Props) {
  const [hover, setHover] = useState(false);
  const [pop, setPop] = useState(0);
  const [blink, setBlink] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 110);
        // one blink in five is a double blink — a small, non-mechanical tell
        if (Math.random() < 0.2) {
          window.setTimeout(() => {
            setBlink(true);
            window.setTimeout(() => setBlink(false), 90);
          }, 190);
        }
        loop();
      }, 2400 + Math.random() * 4200);
    };
    loop();
    return () => window.clearTimeout(t);
  }, []);

  // --- autonomous gaze: the eyes look around even with no pointer ---------
  useEffect(() => {
    let t: number;
    let cancelled = false;
    const loop = () => {
      t = window.setTimeout(() => {
        if (cancelled) return;
        setGaze({
          x: Math.random() * 2 - 1,
          y: (Math.random() * 2 - 1) * 0.7,
        });
        loop();
      }, 650 + Math.random() * 2200);
    };
    loop();
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  const c = bot.color;
  const stateColor = STATE_COLOR[bot.state];
  const dim = bot.state === "waiting";
  const emblem = EMBLEM[bot.id] ?? "•";
  const gid = `b${bot.id.replace(/\W/g, "")}`;

  const eyeOpen = blink ? 0.1 : 1;
  const ex = Math.max(-1, Math.min(1, eye.x + gaze.x * 0.6));
  const ey = Math.max(-1, Math.min(1, eye.y + gaze.y * 0.55));

  // ---- the 3D tilt ------------------------------------------------------
  const tiltY = Math.max(-26, Math.min(26, stretch.x * 26 + eye.x * 6));
  const tiltX = Math.max(-22, Math.min(22, -stretch.y * 22 + eye.y * 5));
  const swing = bot.state === "working" ? 1.5 : bot.state === "waiting" ? 0.35 : 0.8;

  const screenPct = bot.progress !== null ? Math.max(0, Math.min(1, bot.progress)) : 0;

  return (
    <div
      className="relative shrink-0 select-none"
      style={{ width: size, height: size, perspective: 420 }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={() => {
        setPop((p) => p + 1);
      }}
      role="img"
      aria-label={`${bot.name} — ${STATE_LABEL[bot.state]}${
        bot.headline ? ` — ${bot.headline}` : ""
      }`}
    >
      <div
        style={{
          width: size,
          height: size,
          transform: `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 180ms cubic-bezier(.22,1,.36,1)",
          animation: hover
            ? "botTurn 6s ease-in-out infinite"
            : `botTurn ${(9 / (active ? 1 : 0.4)).toFixed(1)}s ease-in-out infinite`,
        }}
      >
        <svg viewBox="0 0 100 112" className="h-full w-full overflow-visible">
          <title>
            {`${bot.name} — ${STATE_LABEL[bot.state]}. L'anneau autour = l'état ; l'arc = ${
              bot.progress !== null
                ? `la mesure du bot (${(bot.progress * 100).toFixed(1)} %)`
                : "pas de mesure attachée"
            }.`}
          </title>
          <defs>
            {/* the head: a sphere lit from the upper left */}
            <radialGradient id={`head-${gid}`} cx="34%" cy="26%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="24%" stopColor={c} stopOpacity={dim ? 0.55 : 0.95} />
              <stop offset="58%" stopColor={c} stopOpacity={dim ? 0.28 : 0.6} />
              <stop offset="86%" stopColor="#05070c" stopOpacity={dim ? 0.2 : 0.45} />
              <stop offset="100%" stopColor="#05070c" stopOpacity={dim ? 0.34 : 0.72} />
            </radialGradient>
            {/* the torso: brushed metal, tinted by the domain */}
            <linearGradient id={`torso-${gid}`} x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#39445c" />
              <stop offset="38%" stopColor="#1e2635" />
              <stop offset="72%" stopColor="#121826" />
              <stop offset="100%" stopColor="#080c14" />
            </linearGradient>
            <linearGradient id={`visor-${gid}`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stopColor="#0d1420" />
              <stop offset="60%" stopColor="#070b12" />
              <stop offset="100%" stopColor="#03060c" />
            </linearGradient>
            <linearGradient id={`edge-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="45%" stopColor={c} stopOpacity="0.25" />
              <stop offset="100%" stopColor={stateColor} stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`arc-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={c} />
              <stop offset="100%" stopColor={stateColor} />
            </linearGradient>
            <radialGradient id={`glow-${gid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c} stopOpacity="0.45" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </radialGradient>
            <filter id={`soft-${gid}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
            <filter id={`soft2-${gid}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* the halo — the light the sprite casts around itself */}
          <circle
            cx="50"
            cy="50"
            r="46"
            fill={`url(#glow-${gid})`}
            style={{
              animation: active
                ? "breathe 2.6s ease-in-out infinite"
                : "breathe 5s ease-in-out infinite",
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          />

          {/* the state halo — a disc and a ring that say *how* the bot is */}
          <circle
            cx="50"
            cy="50"
            r="49"
            fill={stateColor}
            opacity={bot.state === "working" ? 0.09 : 0.04}
            style={{
              animation:
                bot.state === "working"
                  ? "haloPulse 2.4s ease-in-out infinite"
                  : undefined,
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          />
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke={stateColor}
            strokeOpacity={bot.state === "idle" ? 0.22 : 0.5}
            strokeWidth="1"
            strokeDasharray={bot.state === "waiting" ? "2 7" : undefined}
          />

          {/* the shadow on the ground — it shrinks when the body leans */}
          <ellipse
            cx="50"
            cy="103"
            rx={Math.max(13, 22 - Math.abs(tiltY) * 0.26)}
            ry="4.4"
            fill="#000"
            opacity={Math.max(0.16, 0.4 - Math.abs(tiltY) * 0.004)}
            style={{ transition: "rx 180ms ease-out, opacity 180ms ease-out" }}
          />

          {/* the sprite */}
          <g
            style={{
              transform: `translate(calc(50px + var(--sx, ${(stretch.x * 3).toFixed(2)}px)), calc(50px + var(--sy, ${(stretch.y * 3).toFixed(2)}px))) scale(${hover ? 1.04 : 1}, ${
                hover ? 0.96 : 1
              }) translate(-50px, -50px)`,
              transition: "transform 140ms cubic-bezier(.34,1.56,.64,1)",
              animation: bot.state === "alert" ? "botShake 1.1s ease-in-out infinite" : undefined,
            }}
          >
            {/* the legs */}
            <rect x="38" y="78" width="9" height="16" rx="4.5" fill={`url(#torso-${gid})`} />
            <rect x="53" y="78" width="9" height="16" rx="4.5" fill={`url(#torso-${gid})`} />

            {/* the arms — they swing with the activity */}
            <g
              style={{
                transformOrigin: "29px 56px",
                transformBox: "view-box",
                animation: `armSwing ${(3.4 / swing).toFixed(2)}s ease-in-out infinite`,
              }}
            >
              <rect x="20" y="54" width="10" height="22" rx="5" fill={`url(#torso-${gid})`} />
              <circle cx="25" cy="77" r="5.4" fill={c} opacity={dim ? 0.35 : 0.8} />
            </g>
            <g
              style={{
                transformOrigin: "71px 56px",
                transformBox: "view-box",
                animation: `armSwing ${(3.4 / swing).toFixed(2)}s ease-in-out infinite reverse`,
              }}
            >
              <rect x="70" y="54" width="10" height="22" rx="5" fill={`url(#torso-${gid})`} />
              <circle cx="75" cy="77" r="5.4" fill={c} opacity={dim ? 0.35 : 0.8} />
            </g>

            {/* the torso */}
            <rect
              x="29"
              y="48"
              width="42"
              height="34"
              rx="11"
              fill={`url(#torso-${gid})`}
              stroke={`url(#edge-${gid})`}
              strokeWidth="1.3"
            />

            {/* the chest screen: the bot's own measurement */}
            <rect x="37" y="54" width="26" height="21" rx="6" fill="#05080e" stroke={c} strokeOpacity="0.35" strokeWidth="1" />
            {bot.progress !== null ? (
              <rect
                x="39"
                y="72"
                width={22 * screenPct}
                height="2.4"
                rx="1.2"
                fill={c}
                opacity="0.9"
                style={{ transition: "width 700ms ease-out" }}
              />
            ) : null}
            {/* the emblem of the actor */}
            <text
              x="50"
              y="66"
              textAnchor="middle"
              fontSize="11"
              fill={stateColor}
              opacity={dim ? 0.55 : 0.95}
              style={{ animation: "emblemGlow 2.8s ease-in-out infinite" }}
            >
              {emblem}
            </text>

            {/* the head */}
            <circle cx="50" cy="32" r="20" fill={`url(#head-${gid})`} />
            {/* the visor */}
            <rect x="33" y="22" width="34" height="21" rx="10" fill={`url(#visor-${gid})`} stroke={`url(#edge-${gid})`} strokeWidth="1.1" />
            {/* the eyes — they follow the pointer */}
            <g
              style={{
                transform: `translate(${(ex * 1.8).toFixed(2)}px, ${(ey * 1.4).toFixed(2)}px)`,
                transition: "transform 120ms ease-out",
              }}
            >
              <rect
                x="39"
                y="27"
                width="8"
                height={9 * eyeOpen}
                rx="4"
                fill={stateColor}
                opacity={dim ? 0.5 : 1}
                style={{
                  filter: dim ? undefined : `url(#soft-${gid})`,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }}
              />
              <rect
                x="53"
                y="27"
                width="8"
                height={9 * eyeOpen}
                rx="4"
                fill={stateColor}
                opacity={dim ? 0.5 : 1}
                style={{
                  filter: dim ? undefined : `url(#soft-${gid})`,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }}
              />
            </g>
            {/* the specular streak on the visor */}
            <path
              d="M36 24 L48 24"
              stroke="#ffffff"
              strokeOpacity="0.28"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* the mouth — a small arc below the visor */}
            <path
              d={
                bot.state === "alert"
                  ? "M 45 47 Q 50 43 55 47"
                  : bot.state === "waiting"
                    ? "M 46 47 L 54 47"
                    : "M 45 46 Q 50 50 55 46"
              }
              fill="none"
              stroke={c}
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ transition: "all 260ms ease" }}
            />

            {/* the antenna: a light that pulses with the run */}
            <line x1="50" y1="12" x2="50" y2="3" stroke={c} strokeWidth="1.7" strokeLinecap="round" opacity="0.85" />
            <circle cx="50" cy="2" r="4.4" fill={stateColor} opacity="0.45" filter={`url(#soft2-${gid})`} />
            <circle
              cx="50"
              cy="2"
              r="2.8"
              fill={stateColor}
              style={{
                animation: `breathe ${bot.state === "working" ? "1.1s" : "2.6s"} ease-in-out infinite`,
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
            />

            {/* waiting: the little sleep marks */}
            {bot.state === "waiting" ? (
              <>
                <text x="72" y="16" fill={c} fontSize="8" opacity="0.8" style={{ animation: "floatz 2.8s ease-in-out infinite" }}>
                  z
                </text>
                <text x="80" y="8" fill={c} fontSize="6" opacity="0.55" style={{ animation: "floatz 2.8s ease-in-out infinite", animationDelay: "-1.3s" }}>
                  z
                </text>
              </>
            ) : null}
          </g>

          {/* the progress ring — the bot's own measurement */}
          {bot.progress !== null ? (
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke={c}
              strokeOpacity="0.16"
              strokeWidth="2.4"
            />
          ) : null}
          {bot.progress !== null ? (
            <>
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke={`url(#arc-${gid})`}
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeDasharray={`${295 * screenPct} 295`}
                transform="rotate(-90 50 50)"
                opacity="0.45"
                filter={`url(#soft-${gid})`}
                style={{ transition: "stroke-dasharray 700ms ease" }}
              />
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke={`url(#arc-${gid})`}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeDasharray={`${295 * screenPct} 295`}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dasharray 700ms ease" }}
              />
            </>
          ) : null}

          {/* the sparkles of a working bot */}
          {active && bot.state === "working" ? (
            <g>
              {[0, 1, 2].map((i) => (
                <circle
                  key={i}
                  cx={50 + Math.cos(i * 2.1) * 42}
                  cy={50 + Math.sin(i * 2.1) * 42}
                  r="1.9"
                  fill={c}
                  opacity="0.8"
                  style={{
                    animation: `breathe ${1 + i * 0.35}s ease-in-out infinite`,
                    transformBox: "fill-box",
                    transformOrigin: "center",
                  }}
                />
              ))}
            </g>
          ) : null}

          {/* the click pop */}
          {pop ? (
            <circle
              key={pop}
              cx="50"
              cy="50"
              r="20"
              fill="none"
              stroke={c}
              strokeWidth="2"
              style={{ animation: "pop 480ms ease-out forwards" }}
            />
          ) : null}
        </svg>
      </div>

      {selected ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 0 2px ${c}55, 0 0 22px -4px ${c}` }}
        />
      ) : null}

      <style>{`
        /* the slow turn of a solid body */
        @keyframes botTurn {
          0%, 100% { rotate: -2.5deg; }
          50% { rotate: 2.5deg; }
        }
        /* the arms swing faster when the bot works */
        @keyframes armSwing {
          0%, 100% { transform: rotate(-11deg); }
          50% { transform: rotate(11deg); }
        }
        /* an alert bot trembles a little */
        @keyframes botShake {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(0.7px, -0.5px); }
          75% { transform: translate(-0.7px, 0.5px); }
        }
        /* the emblem breathes, so the eye catches it */
        @keyframes emblemGlow {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @keyframes pop {
          from { r: 18; opacity: 0.9; stroke-width: 3; }
          to { r: 56; opacity: 0; stroke-width: 0.5; }
        }
        @keyframes floatz {
          0%   { transform: translate(0, 0) scale(0.85); opacity: 0; }
          25%  { opacity: 0.8; }
          100% { transform: translate(5px, -13px) scale(1.15); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
