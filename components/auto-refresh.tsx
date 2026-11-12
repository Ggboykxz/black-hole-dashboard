"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLiveFeed } from "./live-provider";

/**
 * Automatic refresh of the *content*, driven by the shared feed.
 *
 * The feed already polls `/api/live` once a second. Re-fetching it here (as
 * the first version did, every 10 s) was a second request, a second clock
 * and a second failure mode. This component now only watches the step the
 * feed received: when the run has moved by `threshold` steps, it asks Next
 * to re-render the server content from the newly published snapshot.
 *
 * The threshold (50 steps ≈ 2 min) avoids re-rendering on every log line:
 * the live panel handles the second-by-second part, this handles the
 * content. It pauses with the feed — "en pause" means the page truly stops
 * talking to the network.
 */
export default function AutoRefresh({ threshold = 50 }: { threshold?: number }) {
  const router = useRouter();
  const { live, paused } = useLiveFeed();
  const last = useRef<number | null>(null);
  const step = live?.step ?? null;

  useEffect(() => {
    if (paused || step === null) return;
    if (last.current === null) {
      last.current = step;
      return;
    }
    if (Math.abs(step - last.current) >= threshold) {
      last.current = step;
      router.refresh();
    }
  }, [step, paused, router, threshold]);

  return null;
}
