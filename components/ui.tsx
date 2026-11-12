import type { ReactNode } from "react";

export function Card({
  title,
  source,
  right,
  children,
  className = "",
  botTarget,
}: {
  title?: ReactNode;
  source?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** semantic handle used by the copilot (`data-bot-target`) */
  botTarget?: string;
}) {
  return (
    <section className={`card ${className}`} data-bot-target={botTarget}>
      {title ? (
        <header className="card-head">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-medium tracking-tight text-ink">
              {title}
            </h2>
            {source ? (
              <p
                className="mt-0.5 truncate font-mono text-[10px] text-faint"
                /* la source est souvent tronquée par `truncate` — le
                   title natif rend le texte entier au survol partout
                   où la carte apparaît, sans hydrater un overlay par
                   carte (un BoardUI Tooltip ici poserait dix déclencheurs
                   focusables par page dans l'ordre de tabulation) */
                title={typeof source === "string" ? source : undefined}
              >
                {source}
              </p>
            ) : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  spark,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "accent";
  spark?: ReactNode;
}) {
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : tone === "accent"
            ? "text-accent"
            : "text-ink";
  const dot =
    tone === "good"
      ? "#34d399"
      : tone === "warn"
        ? "#fbbf24"
        : tone === "bad"
          ? "#fb7185"
          : tone === "accent"
            ? "#38bdf8"
            : null;
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line/90 bg-gradient-to-br from-white/[0.035] to-white/[0.012] px-3.5 pb-2.5 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2a3343] hover:from-white/[0.05] hover:to-white/[0.02]">
      {dot ? (
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `linear-gradient(90deg, transparent, ${dot}, transparent)`,
          }}
        />
      ) : null}
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.1em] text-faint">
        {dot ? (
          <span
            className="h-1 w-1 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        ) : null}
        {label}
      </div>
      <div className={`num mt-1.5 text-[20px] leading-none tracking-tight ${color}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-[10.5px] leading-snug text-dim">{sub}</div> : null}
      {/* the sparkline is a reading, not a backdrop: it sits under the value,
          full width, and only takes the space it needs. An empty series is
          not drawn at all — the number above is already the truth. */}
      {spark ? (
        <div className="pointer-events-none mt-auto pt-2 opacity-80 transition-opacity group-hover:opacity-100">
          {spark}
        </div>
      ) : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "accent" | "muted";
}) {
  const map: Record<string, string> = {
    default: "border-line text-dim",
    good: "border-good/40 text-good bg-good/5",
    warn: "border-warn/40 text-warn bg-warn/5",
    bad: "border-bad/40 text-bad bg-bad/5",
    accent: "border-accent/40 text-accent bg-accent/5",
    muted: "border-line-soft text-faint",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[10px] leading-none backdrop-blur-sm ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Source({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="font-mono text-[10px] leading-relaxed text-faint">
      {children}
    </p>
  );
}

export function Bar({
  percent,
  tone = "accent",
}: {
  percent: number;
  tone?: "accent" | "good" | "warn";
}) {
  const bg =
    tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#12161e]">
      <div
        className={`h-full ${bg} rounded-full transition-[width] duration-700 ease-out`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}
