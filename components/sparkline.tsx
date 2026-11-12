"use client";

import { useId } from "react";

/**
 * The path of a sparkline, in viewBox units.
 *
 * Linear on purpose: this is a *reading* of the values the producer wrote,
 * not a smoothed model of them. A curve that rounds a corner invents a value
 * between two measurements; a straight segment only says "between these two
 * readings, the eye can draw a line".
 *
 * The scale is fixed to the series' own min/max — a sparkline shows shape,
 * not absolute level. The level is always printed next to it, at producer
 * precision, so the shape can never be mistaken for the number.
 */
export function sparkPath(
  values: number[],
  w = 100,
  h = 28,
  pad = 2,
): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (values.length === 1) {
    return `M0 ${(h / 2).toFixed(2)} L${w} ${(h / 2).toFixed(2)}`;
  }
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y =
        span === 0 ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/** The y of a single value on the same scale `sparkPath` uses. */
export function sparkY(value: number, values: number[], h = 28, pad = 2): number {
  if (!values.length) return h / 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return h / 2;
  return h - pad - ((value - min) / (max - min)) * (h - pad * 2);
}

/**
 * A dependency-free sparkline.
 *
 * The dashboard's stated rule is that it renders the artefacts and invents
 * nothing; a sparkline is the smallest possible rendering of a real series,
 * so it rides the same rule. When the series is empty it draws a hairline at
 * mid-height — the honest "no measurement yet" — never a zero line that
 * could be read as a value.
 */
export default function Sparkline({
  values,
  color = "#38bdf8",
  height = 28,
  width = 100,
  area = true,
  strokeWidth = 1.4,
  dot = true,
  className = "",
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  area?: boolean;
  strokeWidth?: number;
  dot?: boolean;
  className?: string;
  /** accessible name; omitted → the SVG is decorative (`aria-hidden`) */
  label?: string;
}) {
  /* `useId` returns colons (":r1:"), which are legal in an id but awkward
     inside `url(#…)`; strip them so the gradient reference is unambiguous. */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gid = `spark-${uid}`;
  const path = sparkPath(values, width, height);
  const last = values[values.length - 1];
  const lastY = last !== undefined ? sparkY(last, values, height) : height / 2;
  const fill = path ? `${path} L${width} ${height} L0 ${height} Z` : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {path ? (
        <>
          {area ? <path d={fill} fill={`url(#${gid})`} /> : null}
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {dot ? (
            <>
              <circle cx={width} cy={lastY} r="3.4" fill={color} opacity="0.18" />
              <circle
                cx={width}
                cy={lastY}
                r="1.7"
                fill={color}
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </>
      ) : (
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#1e2430"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
