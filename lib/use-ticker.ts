"use client";

import { useEffect, useState } from "react";

/**
 * A local clock, driven by `requestAnimationFrame`.
 *
 * The live feed's *network* cadence is one poll per second. The **UI** does
 * not need to wait for a poll to move: the age of the last measurement, the
 * UTC clock and the freshness bar are pure functions of `Date.now()` and the
 * payload's `updated_at`. This hook recomputes them on the browser's own
 * frame clock, at a bounded rate (`intervalMs`) so a 144 Hz monitor does not
 * re-render the tree 144 times a second.
 *
 * It returns `0` until hydration — the same rule as `useHydratedClock`:
 * a clock rendered on the server and on the client is never the same value,
 * and pretending otherwise produces a hydration mismatch.
 */
export function useTicker(intervalMs = 100): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last >= intervalMs) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [intervalMs]);

  return now;
}
