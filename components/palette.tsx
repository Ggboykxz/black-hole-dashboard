"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette, CommandPaletteItem, CommandPaletteSection } from "@/components/base/command-palette/command-palette";
import {
  RiHome4Line,
  RiLiveLine,
  RiPulseLine,
  RiRadarLine,
  RiRouteLine,
  RiScales3Line,
  RiFunctionLine,
  RiBarChart2Line,
  RiMagicLine,
  RiDatabase2Line,
  RiFileList3Line,
  RiBook2Line,
  RiFileHistoryLine,
  RiRefreshLine,
  RiPauseCircleLine,
} from "@remixicon/react";
import type { ComponentType } from "react";
import { LINKS } from "./nav";
import { useLiveFeed } from "./live-provider";

/* Les icônes, par page — la même liste que le rail (`nav.tsx`), une
   seule source de vérité pour les routes du site. */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/": RiHome4Line,
  "/live": RiLiveLine,
  "/variations": RiPulseLine,
  "/analyse": RiRadarLine,
  "/roadmap": RiRouteLine,
  "/comparaison": RiScales3Line,
  "/entrainement": RiFunctionLine,
  "/metriques": RiBarChart2Line,
  "/predictions": RiMagicLine,
  "/donnees": RiDatabase2Line,
  "/echantillons": RiFileList3Line,
  "/runbook": RiBook2Line,
  "/journal": RiFileHistoryLine,
};

/* ── la palette ⌘K du site ──────────────────────────────────
   Le rail liste les pages, le dock mène aux cinq principales,
   mais il n'existait aucun moyen de sauter n'importe où depuis
   le clavier — et sur mobile aucune nav du tout (le rail est
   `hidden md:flex`). La palette couvre les deux : ⌘K / Ctrl+K
   partout, filtration accent-insensible déjà intégrée, et les
   actions qui sont de vraies commandes, pas des liens
   décorés — rafraîchir parle au routeur, la pause écrit dans
   le même état que le toggle du header. */
export default function Palette() {
  const router = useRouter();
  const { paused, setPaused } = useLiveFeed();
  /* contrôlée : le bouton ⌘K du header l'ouvre via l'événement
     `bh:palette` (le bouton est loin d'ici, un store partagé serait
     du câblage pour rien), ⌘K lui-même reste géré par le composant */
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("bh:palette", openIt);
    return () => window.removeEventListener("bh:palette", openIt);
  }, []);

  return (
    <CommandPalette
      aria-label="Palette de commandes"
      placeholder="Aller à…"
      isOpen={open}
      onOpenChange={setOpen}
    >
      <CommandPaletteSection title="Pages">
        {LINKS.map((l) => (
          <CommandPaletteItem
            key={l.href}
            id={`aller:${l.href}`}
            icon={ICONS[l.href]}
            onAction={() => router.push(l.href)}
          >
            {l.label}
          </CommandPaletteItem>
        ))}
      </CommandPaletteSection>
      <CommandPaletteSection title="Actions">
        <CommandPaletteItem
          id="action:refresh"
          icon={RiRefreshLine}
          onAction={() => router.refresh()}
        >
          Rafraîchir la page
        </CommandPaletteItem>
        <CommandPaletteItem
          id="action:pause"
          icon={RiPauseCircleLine}
          onAction={() => setPaused(!paused)}
        >
          {paused ? "Reprendre le direct" : "Mettre le direct en pause"}
        </CommandPaletteItem>
      </CommandPaletteSection>
    </CommandPalette>
  );
}
