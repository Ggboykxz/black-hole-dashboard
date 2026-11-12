"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
  /** draw the area under the line */
  area?: boolean;
}

export interface Marker {
  x: number;
  label: string;
  color?: string;
}

export interface HLine {
  y: number;
  label: string;
  color?: string;
}

export type NumFormat = "loss2" | "loss3" | "loss4" | "loss5" | "sci" | "int" | "ppl";
export type XFormat = NumFormat | "step" | "time";

/** Formats are *named*, not functions: the chart is a client component and a
 *  server component cannot hand it a callback. */
const FORMATTERS: Record<NumFormat, (v: number) => string> = {
  loss2: (v) => v.toFixed(2),
  loss3: (v) => v.toFixed(3),
  loss4: (v) => v.toFixed(4),
  loss5: (v) => v.toFixed(5),
  sci: (v) => v.toExponential(1),
  int: (v) => Math.round(v).toLocaleString("fr-FR"),
  ppl: (v) => v.toFixed(2),
};

const X_FORMATTERS: Record<XFormat, (v: number) => string> = {
  ...FORMATTERS,
  step: (v) => Math.round(v).toLocaleString("fr-FR"),
  time: (v) =>
    new Date(v).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
};

interface Props {
  series: Series[];
  height?: number;
  yFormat?: NumFormat;
  xFormat?: XFormat;
  markers?: Marker[];
  hlines?: HLine[];
  yDomain?: [number, number];
  xDomain?: [number, number];
  title?: string;
  unit?: string;
}

/**
 * A dependency-free SVG chart with a hover crosshair.
 *
 * Hand-rolled on purpose: the repository has no charting dependency, the
 * dashboard must stay installable with `npm i` alone, and every chart here
 * needs the same three things — a fixed protocol band, a marker for a step
 * that decided something, and a caption naming the source.
 */
export default function Chart({
  series,
  height = 300,
  yFormat = "loss3",
  xFormat = "step",
  markers = [],
  hlines = [],
  yDomain,
  xDomain,
  title,
  unit,
}: Props) {
  const fmtY = FORMATTERS[yFormat] ?? FORMATTERS.loss3;
  const fmtX = X_FORMATTERS[xFormat] ?? X_FORMATTERS.step;
  const W = 1000;
  const H = 300;
  const PAD = { l: 58, r: 16, t: 14, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    const ys = series.flatMap((s) => s.points.map((p) => p.y));
    if (!xs.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    let y0 = yDomain ? yDomain[0] : Math.min(...ys);
    let y1 = yDomain ? yDomain[1] : Math.max(...ys);
    if (!yDomain) {
      const pad = (y1 - y0) * 0.12 || Math.max(0.01, Math.abs(y1) * 0.02);
      y0 -= pad;
      y1 += pad;
    }
    return {
      xMin: xDomain ? xDomain[0] : Math.min(...xs),
      xMax: xDomain ? xDomain[1] : Math.max(...xs),
      yMin: y0,
      yMax: y1,
    };
  }, [series, yDomain, xDomain]);

  const sx = useCallback(
    (x: number) =>
      PAD.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * (W - PAD.l - PAD.r),
    [xMin, xMax],
  );
  const sy = useCallback(
    (y: number) =>
      H - PAD.b - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * (H - PAD.t - PAD.b),
    [yMin, yMax],
  );

  const path = useCallback(
    (s: Series) =>
      s.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`)
        .join(" "),
    [sx, sy],
  );

  const areaPath = useCallback(
    (s: Series) => {
      if (!s.points.length) return "";
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      return `${path(s)} L${sx(last.x).toFixed(2)},${(H - PAD.b).toFixed(2)} L${sx(first.x).toFixed(2)},${(H - PAD.b).toFixed(2)} Z`;
    },
    [path, sx],
  );

  const allX = useMemo(() => {
    const set = new Set<number>();
    series.forEach((s) => s.points.forEach((p) => set.add(p.x)));
    return [...set].sort((a, b) => a - b);
  }, [series]);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || !allX.length) return;
      const rect = el.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      const px = PAD.l + rel * (W - PAD.l - PAD.r);
      let best = 0;
      let bestD = Infinity;
      allX.forEach((x, i) => {
        const d = Math.abs(sx(x) - px);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setHover(best);
    },
    [allX, sx],
  );

  const hoverX = hover !== null ? allX[hover] : null;
  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / n);
  }, [yMin, yMax]);
  const xTicks = useMemo(() => {
    const n = 6;
    return Array.from({ length: n + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / n);
  }, [xMin, xMax]);

  return (
    <div className="relative w-full">
      <div
        ref={ref}
        className="w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height }}
          preserveAspectRatio="none"
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`g${i}-${s.label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={sy(t)}
                y2={sy(t)}
                stroke="#171c26"
                strokeWidth="1"
              />
              <text
                x={PAD.l - 8}
                y={sy(t) + 3}
                textAnchor="end"
                fontSize="10"
                fill="#64708a"
                className="num"
              >
                {fmtY(t)}
              </text>
            </g>
          ))}

          {xTicks.map((t, i) => (
            <text
              key={i}
              x={sx(t)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#64708a"
              className="num"
            >
              {fmtX(t)}
            </text>
          ))}

          {hlines.map((h, i) => (
            <g key={`h${i}`}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={sy(h.y)}
                y2={sy(h.y)}
                stroke={h.color ?? "#fbbf24"}
                strokeWidth="1"
                strokeDasharray="5 4"
                opacity="0.8"
              />
              <text
                x={W - PAD.r - 4}
                y={sy(h.y) - 5}
                textAnchor="end"
                fontSize="10"
                fill={h.color ?? "#fbbf24"}
              >
                {h.label}
              </text>
            </g>
          ))}

          {markers.map((m, i) => (
            <g key={`m${i}`}>
              <line
                x1={sx(m.x)}
                x2={sx(m.x)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke={m.color ?? "#64708a"}
                strokeWidth="1"
                strokeDasharray="3 4"
                opacity="0.75"
              />
              <text
                x={sx(m.x) + 4}
                y={PAD.t + 10}
                fontSize="9.5"
                fill={m.color ?? "#98a2b6"}
              >
                {m.label}
              </text>
            </g>
          ))}

          {series.map((s, i) =>
            s.area ? (
              <path
                key={`a${i}`}
                d={areaPath(s)}
                fill={`url(#g${i}-${s.label.replace(/\W/g, "")})`}
              />
            ) : null,
          )}

          {series.map((s, i) => (
            <path
              key={`p${i}`}
              d={path(s)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeDasharray={s.dashed ? "6 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* the last measurement, marked — the curve stops where the data
              stops, and the eye must see it */}
          {series.map((s, i) => {
            if (!s.points.length) return null;
            const last = s.points[s.points.length - 1];
            return (
              <g key={`e${i}`}>
                <circle
                  cx={sx(last.x)}
                  cy={sy(last.y)}
                  r="6"
                  fill={s.color}
                  className="chart-last"
                />
                <circle
                  cx={sx(last.x)}
                  cy={sy(last.y)}
                  r="3"
                  fill="#07080b"
                  stroke={s.color}
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {hoverX !== null ? (
            <g>
              <line
                x1={sx(hoverX)}
                x2={sx(hoverX)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="#38bdf8"
                strokeWidth="1"
                opacity="0.6"
              />
              {series.map((s, i) => {
                const p = s.points.find((q) => q.x === hoverX);
                if (!p) return null;
                return (
                  <circle
                    key={i}
                    cx={sx(p.x)}
                    cy={sy(p.y)}
                    r="3.5"
                    fill="#07080b"
                    stroke={s.color}
                    strokeWidth="2"
                  />
                );
              })}
            </g>
          ) : null}
        </svg>
      </div>

      {hoverX !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-lg border border-line bg-panel2/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur"
          style={{
            left: `${Math.min(78, Math.max(2, (sx(hoverX) / W) * 100))}%`,
          }}
        >
          <div className="num mb-1 text-[10px] text-faint">step {fmtX(hoverX)}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.x === hoverX);
            if (!p) return null;
            return (
              <div key={s.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-dim">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
                <span className="num text-ink">{fmtY(p.y)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-[10.5px] text-faint">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-4"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
        {unit ? <span>{unit}</span> : null}
        {title ? <span className="ml-auto">{title}</span> : null}
      </div>
    </div>
  );
}
