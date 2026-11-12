"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLiveFeed } from "./live-provider";
import { SignalAge } from "./live-clock";

interface NavLink {
  href: string;
  label: string;
  icon: string;
}

/**
 * The rail used to be one flat list of thirteen links: the run, the model,
 * the proofs, the journal — all at the same weight. Grouping them is not
 * decoration; it is the difference between "a menu" and "a map of what this
 * dashboard answers". The groups are also the order the questions are asked:
 * where is the run, what is the model, what proves it.
 */
export const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "le run",
    links: [
      { href: "/", label: "Synthèse", icon: "◈" },
      { href: "/live", label: "Le direct", icon: "◉" },
      { href: "/variations", label: "Variations", icon: "≈" },
      { href: "/analyse", label: "Analyse", icon: "⌁" },
    ],
  },
  {
    label: "le modèle",
    links: [
      { href: "/roadmap", label: "Feuille de route", icon: "⛭" },
      { href: "/comparaison", label: "Comparaison", icon: "⇌" },
      { href: "/entrainement", label: "Entraînement", icon: "∿" },
      { href: "/metriques", label: "Métriques", icon: "∑" },
      { href: "/predictions", label: "Prédictions", icon: "◇" },
    ],
  },
  {
    label: "les preuves",
    links: [
      { href: "/donnees", label: "Données", icon: "▤" },
      { href: "/echantillons", label: "Échantillons", icon: "✎" },
      { href: "/runbook", label: "Runbook", icon: "⚙" },
      { href: "/journal", label: "Journal", icon: "☰" },
    ],
  },
  {
    label: "le poste",
    links: [{ href: "/opencode", label: "OpenCode", icon: "◆" }],
  },
];

/** flat view — the palette (⌘K) searches every page in one list */
export const LINKS: NavLink[] = GROUPS.flatMap((g) => g.links);

/**
 * The rail's navigation.
 *
 * It used to poll `/api/live` on its own (every 5 s) only to print a UTC
 * timestamp under "rafraîchir" — a third request, a third clock. It now reads
 * the shared feed: the live dot follows the *state* of the signal (not a
 * hard-coded green), and the timestamp is the one the feed actually received.
 */
export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const feed = useLiveFeed();
  const { live, meta, state } = feed;

  return (
    <nav className="flex flex-col gap-2.5" aria-label="Navigation du dashboard">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-0.5 text-[8.5px] font-medium uppercase tracking-[0.18em] text-faint/75">
            {group.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.links.map((l) => {
              const active =
                l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-[6px] text-[12.5px] transition-all duration-150 ${
                    active
                      ? "bg-accent/10 text-ink shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)]"
                      : "text-dim hover:bg-white/[0.035] hover:text-ink"
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent shadow-[0_0_8px_#38bdf8]" />
                  ) : null}
                  <span
                    className={`w-4 shrink-0 text-center text-[11px] transition-transform duration-150 group-hover:scale-110 ${
                      active ? "text-accent" : "text-faint"
                    }`}
                  >
                    {l.icon}
                  </span>
                  <span className="truncate">{l.label}</span>
                  {l.href === "/live" ? (
                    <span
                      className={`pulse ml-auto ${state === "live" ? "" : "pulse-static"}`}
                      style={{ ["--pulse-color" as string]: meta.color }}
                      title={meta.label}
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={() => router.refresh()}
        className="mt-1 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[11px] text-faint transition-colors hover:border-accent/40 hover:text-accent"
      >
        <span>⟳</span>
        <span>
          rafraîchir
          <span className="num block text-[9.5px] opacity-70">
            {live?.updated_at ? (
              <>
                {live.updated_at.slice(11, 19)} UTC ·{" "}
                <SignalAge updatedAt={live.updated_at} />
              </>
            ) : (
              "en attente du signal"
            )}
          </span>
        </span>
      </button>
    </nav>
  );
}
