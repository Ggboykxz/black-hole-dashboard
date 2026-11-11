"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLiveFeed } from "./live-provider";

/**
 * Automatic refresh.
 *
 * When something is added — a new checkpoint, a new official measure, a new
 * sample, a new documentation block — the snapshot is rewritten by the
 * keepalive and pushed to the Hub; this component notices that the run moved
 * and re-renders the page from the server. The user does nothing.
 *
 * The threshold (50 steps ≈ 2 min) avoids re-rendering on every log line:
 * the *live* panel handles the second-by-second part, this handles the
 * content.
 *
 * It pauses with the live feed: the toggle in the header stops both pollers,
 * so "en pause" means the page truly stops talking to the network — not just
 * the numbers freezing while two timers keep firing.
 */
export default function AutoRefresh({ threshold = 50 }: { threshold?: number }) {
  const router = useRouter();
  const { paused } = useLiveFeed();
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const step = Number(data?.step ?? 0);
        if (last.current === null) {
          last.current = step;
          return;
        }
        if (Math.abs(step - last.current) >= threshold) {
          last.current = step;
          router.refresh();
        }
      } catch {
        /* offline: keep what we have */
      }
    };
    void tick();
    const t = window.setInterval(tick, 10000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [router, threshold, paused]);

  return null;
}
