"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildHealth, type Health } from "@/lib/health";
import { useLiveFeed } from "./live-provider";
import { humanAge } from "@/lib/signal";

const TONE: Record<string, { bg: string; text: string; border: string }> = {
  ok: { bg: "bg-good/10", text: "text-good", border: "border-good/40" },
  warn: { bg: "bg-warn/10", text: "text-warn", border: "border-warn/40" },
  critical: { bg: "bg-bad/12", text: "text-bad", border: "border-bad/50" },
};

/**
 * The session's vital signs — and the alarm.
 *
 * If the Colab session dies, the trainer is killed, the keepalive stops or
 * the GPU disappears, this panel turns red and says *what to do*. It is the
 * one part of the dashboard that must never be optimistic.
 */
export default function HealthPanel({
  snapshot,
  compact = false,
}: {
  snapshot: Snapshot;
  compact?: boolean;
}) {
  const feed = useLiveFeed();
  const { live } = feed;
  const [health, setHealth] = useState<Health>(() => buildHealth(snapshot, null));

  // the panel reads the shared feed: one request for the whole site, and the
  // health is recomputed from the payload that was really received — a failed
  // request is itself a signal, not a silence.
  useEffect(() => {
    setHealth(buildHealth(snapshot, live ?? null));
  }, [snapshot, live]);

  const tone = TONE[health.level];
  const problems = health.checks.filter((c) => c.level !== "ok");

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10.5px] ${tone.bg} ${tone.text} ${tone.border}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            health.level === "ok"
              ? "bg-good"
              : health.level === "warn"
                ? "bg-warn"
                : "bg-bad"
          }`}
        />
        {health.title}
      </div>
    );
  }

  return (
    <div className={`card border ${tone.border}`}>
      <div className={`flex items-center justify-between gap-3 px-4 py-3 ${tone.bg}`}>
        <div className="flex items-center gap-2.5">
          <span
            className={`relative flex h-2.5 w-2.5 items-center justify-center`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                health.level === "ok"
                  ? "bg-good"
                  : health.level === "warn"
                    ? "bg-warn"
                    : "bg-bad"
              }`}
              style={{
                animation:
                  health.level === "ok"
                    ? "breathe 2.4s ease-in-out infinite"
                    : "breathe 900ms ease-in-out infinite",
              }}
            />
          </span>
          <div>
            <div className={`text-[12.5px] font-medium ${tone.text}`}>
              {health.title}
            </div>
            <div className="text-[10.5px] text-dim">{health.detail}</div>
          </div>
        </div>
        <span className="font-mono text-[9.5px] text-faint">
          {feed.source === "local"
            ? "log local"
            : feed.source === "hub"
              ? "heartbeat"
              : feed.source === "cache"
                ? "journal local"
                : feed.source === "snapshot"
                  ? "instantané figé"
                  : "aucune source"}{" "}
          · {live?.updated_at?.slice(11, 19) ?? "—"} UTC ·{" "}
          <span style={{ color: feed.meta.color }}>{feed.meta.label}</span>
        </span>
      </div>

      {/* the freshness of the signal — one bar, one number, always visible */}
      <div className="flex items-center gap-3 border-b border-line/60 px-4 py-2">
        <span className="text-[10px] uppercase tracking-[0.09em] text-faint">
          fraîcheur
        </span>
        <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
            style={{
              width: feed.age === null ? "0%" : `${Math.round(feed.fresh * 100)}%`,
              background: feed.meta.color,
            }}
          />
        </div>
        <span className="num shrink-0 text-[10px]" style={{ color: feed.meta.color }}>
          {feed.age === null
            ? "— (aucune mesure reçue)"
            : `${Math.round(feed.fresh * 100)} % · ${humanAge(feed.age)}`}
        </span>
      </div>

      <div className="grid gap-x-6 gap-y-1.5 px-4 py-3 sm:grid-cols-2">
        {health.checks.map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-[11.5px]">
            <span
              className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                c.level === "ok"
                  ? "bg-good"
                  : c.level === "warn"
                    ? "bg-warn"
                    : "bg-bad"
              }`}
            />
            <div className="min-w-0">
              <span className="text-ink">{c.label}</span>
              {/* the age of a check is computed at render time: the server
                  and the browser can disagree by a minute — React is told to
                  accept that difference instead of re-rendering the page */}
              <span className="text-dim" suppressHydrationWarning>
                {" "}
                — {c.detail}
              </span>
              {c.action ? (
                <div className="mt-1 rounded-md border border-line bg-[#0a0d12] px-2 py-1 font-mono text-[10.5px] leading-relaxed text-accent/90">
                  {c.action}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {problems.length ? (
        <div className="border-t border-line px-4 py-2 text-[10.5px] text-faint">
          {problems.length} point(s) à surveiller — le détail et l&apos;action
          sont ci-dessus. Un dashboard qui garde l&apos;air normal alors que le
          run est arrêté est un dashboard trompeur.
        </div>
      ) : null}
    </div>
  );
}
