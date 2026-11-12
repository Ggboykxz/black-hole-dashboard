"use client";

import { Kbd } from "@/components/base/kbd/kbd";

/* Le bouton qui ouvre la palette ⌘K. Client, parce qu'il parle à
   window : il ne fait que diffuser `bh:palette`, que <Palette />
   écoute — un store partagé serait du câblage pour deux composants. */
export default function PaletteTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("bh:palette"))}
      className="hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-faint transition-colors hover:border-accent/40 hover:text-ink sm:flex"
      aria-label="Ouvrir la palette de commandes (Ctrl+K)"
    >
      Rechercher…
      <Kbd>⌘K</Kbd>
    </button>
  );
}
