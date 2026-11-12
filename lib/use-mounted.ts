"use client";

import { useEffect, useState } from "react";

/**
 * `true` only after the client has hydrated.
 *
 * Anything that depends on *when* it is rendered (an age, a relative time, a
 * clock) differs between the server's render and the browser's: the server
 * is in UTC, the browser in the visitor's timezone, and the two are never
 * exactly a second apart. React then reports a hydration mismatch (#418) and
 * re-renders the whole tree.
 *
 * The rule of this dashboard: **a number that depends on the clock is only
 * rendered once the clock is the same on both sides.** Use the hook to
 * render a neutral placeholder first, or `suppressHydrationWarning` on the
 * single text node that may differ.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** The local clock, `0` until the client has hydrated (see above). */
export function useHydratedClock(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}
