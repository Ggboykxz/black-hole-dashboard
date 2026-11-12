"use client";

import { useLiveFeed } from "./live-provider";

/**
 * The signal ribbon — a 3 px band at the very top of the viewport.
 *
 * Its colour is the *state* of the signal: green while the producer writes,
 * amber when the signal ages, red when there is nothing live. It is the
 * only element that is present on every page, so it is the one that can
 * tell the truth everywhere at a glance — no click, no reading.
 *
 * The light that travels along it is decoration, not data: it only moves
 * while the state is genuinely live, and it stops for reduced motion.
 */
export default function SignalRibbon() {
  const feed = useLiveFeed();
  const { meta, state } = feed;

  return (
    <div
      aria-hidden
      className={`signal-ribbon pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] ${
        state === "live" ? "signal-ribbon-live" : ""
      }`}
      style={{
        background: `linear-gradient(90deg, ${meta.color}, ${meta.color}55 45%, transparent 88%)`,
        boxShadow: state === "live" ? `0 0 14px -2px ${meta.color}` : "none",
      }}
    />
  );
}
