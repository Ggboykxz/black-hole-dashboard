"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const LINKS = [
  { href: "/", label: "Synthèse", icon: "◈" },
  { href: "/live", label: "Le direct", icon: "◉" },
  { href: "/variations", label: "Variations", icon: "≈" },
  { href: "/analyse", label: "Analyse", icon: "⌁" },
  { href: "/roadmap", label: "Feuille de route", icon: "⛭" },
  { href: "/comparaison", label: "Comparaison", icon: "⇌" },
  { href: "/entrainement", label: "Entraînement", icon: "∿" },
  { href: "/metriques", label: "Métriques", icon: "∑" },
  { href: "/predictions", label: "Prédictions", icon: "◇" },
  { href: "/donnees", label: "Données", icon: "▤" },
  { href: "/echantillons", label: "Échantillons", icon: "✎" },
  { href: "/runbook", label: "Runbook", icon: "⚙" },
  { href: "/journal", label: "Journal", icon: "☰" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [at, setAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetch("/api/live", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d?.updated_at) setAt(d.updated_at);
        })
        .catch(() => {});
    };
    void tick();
    const t = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-all duration-150 ${
              active
                ? "bg-accent/10 text-ink shadow-[inset_0_0_0_1px_rgba(56,189,248,0.22)]"
                : "text-dim hover:bg-white/[0.035] hover:text-ink"
            }`}
          >
            <span
              className={`w-4 text-center text-[11px] transition-transform duration-150 group-hover:scale-110 ${
                active ? "text-accent" : "text-faint"
              }`}
            >
              {l.icon}
            </span>
            {l.label}
            {l.href === "/live" ? <span className="pulse ml-auto" /> : null}
          </Link>
        );
      })}
      <button
        onClick={() => router.refresh()}
        className="mt-2 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[11px] text-faint transition-colors hover:border-accent/40 hover:text-accent"
      >
        <span>⟳</span>
        <span>
          rafraîchir
          {at ? (
            <span className="num block text-[9.5px] opacity-70">
              {at.slice(11, 19)} UTC
            </span>
          ) : null}
        </span>
      </button>
    </nav>
  );
}
