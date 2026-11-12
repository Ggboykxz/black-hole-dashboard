"use client";

import { useLiveFeed } from "./live-provider";

/**
 * The signal ribbon — a 3 px band at the very top of the viewport.
 *
 * Its colour is the *state* of the signal: green while the producer writes,
 * amber when the signal ages, red when there is nothing live. It is the
 * only element that is present on every page, so it is the one that can
 * tell the truth everywhere at a glance — no click, no reading.
 */
export default function SignalRibbon() {
  const feed = useLiveFeed();
  const { meta, state } = feed;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]"
      style={{
        background: `linear-gradient(90deg, ${meta.color}, ${meta.color}33 55%, transparent)`,
        transition: "background 600ms ease",
        boxShadow:
          state === "live" ? `0 0 12px -2px ${meta.color}` : "none",
      }}
    />
  );
}
