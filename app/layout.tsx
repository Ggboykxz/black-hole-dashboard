import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
/* BoardUI d'abord : ses resets et ses tokens chargent avant le système
   de design du projet, dont les règles gagnent partout où les deux
   parlent du même élément (body, html). Les tokens sémantiques de
   BoardUI restent disponibles pour ses composants (tooltip, palette,
   skeleton) via la classe `dark` posée sur <html>. */
import "@/styles/globals.css";
import "./globals.css";
import Nav from "@/components/nav";
import AutoRefresh from "@/components/auto-refresh";
import HealthPanel from "@/components/health";
import Notifications from "@/components/notifications";
import Copilot from "@/components/copilot";
import LiveHeader, { RailStatus } from "@/components/live-header";
import { LiveProvider } from "@/components/live-provider";
import SignalRibbon from "@/components/signal-ribbon";
import Palette from "@/components/palette";
import PaletteTrigger from "@/components/palette-trigger";
import { MagnifyingDock } from "@/components/magnifying-dock";
import { ToastStack } from "@/components/toast-stack";
import { EyeTracker } from "@/components/eye-tracker";
import { DraggingBall } from "@/components/dragging-ball";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getSnapshot } from "@/lib/snapshot";

/* la fonte de BoardUI (typography.css lit --font-inter) — le reste du
   site garde sa pile système, rien n'est changé pour lui */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Black Hole — suivi live de l'entraînement",
  description:
    "Tableau de bord live du run bh-005 : courbes, métriques, prédictions, données, bots et assistant. Les mêmes artefacts que la documentation, sans re-parser un seul fichier.",
  openGraph: {
    title: "Black Hole — suivi live de l'entraînement (bh-005)",
    description:
      "Le direct du run bh-005 : step, perte, cadence, GPU, variations et journal des changements — lus dans les mêmes artefacts que la documentation.",
    type: "website",
    siteName: "Black Hole",
  },
  twitter: {
    card: "summary",
    title: "Black Hole — suivi live de l'entraînement (bh-005)",
    description:
      "Le direct du run bh-005 : step, perte, cadence, GPU et journal des changements.",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080b",
  width: "device-width",
  initialScale: 1,
};

export const revalidate = 60;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { snapshot } = await getSnapshot();
  const s = snapshot.status;
  const lastBench = snapshot.benchmarks[snapshot.benchmarks.length - 1];

  return (
    <html lang="fr" className={`dark ${inter.variable}`}>
      <body>
        <LiveProvider
          initialRows={snapshot.series.train.map((p) => ({ step: p.step, loss: p.loss }))}
          initialVals={snapshot.series.val.map((p) => ({ step: p.step, loss: p.loss }))}
        >
        <AutoRefresh />
        <SignalRibbon />
        <Copilot snapshot={snapshot} />
        <Palette />
        <div className="flex min-h-screen">
          {/* the rail */}
          <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-line bg-[#080a0e]/80 px-4 py-5 backdrop-blur md:flex">
            <Link href="/" className="mb-1 block">
              <div className="flex items-center gap-2">
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#38bdf8,#0a0d13_70%)] shadow-[0_0_18px_-4px_#38bdf8]" />
                </span>
                <span className="text-[14px] font-semibold tracking-[0.18em] text-ink">
                  BLACK HOLE
                </span>
              </div>
              <div className="mt-1 pl-8 text-[10px] tracking-widest text-faint">
                {s.run.toUpperCase()}
              </div>
            </Link>

            <div className="mt-5">
              <Nav />
            </div>

            <div className="mt-auto border-t border-line pt-3 text-[10px] text-faint">
              <RailStatus />
              <div className="num mt-2">
                bench {lastBench ? lastBench.loss.toFixed(4) : "—"} @{" "}
                {lastBench?.step ?? "—"}
              </div>
            </div>
          </aside>

          {/* the content */}
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-[#07080b]/85 backdrop-blur">
              <div className="min-w-0 flex-1">
                <LiveHeader
                  bench={
                    lastBench ? { loss: lastBench.loss, step: lastBench.step } : null
                  }
                />
              </div>
              <div className="flex shrink-0 items-center gap-3 pr-4 md:pr-7">
                {/* la prise visible de la palette — ⌘K marche partout,
                   le bouton dit aux autres qu'elle existe */}
                <PaletteTrigger />
                <Notifications snapshot={snapshot} />
              </div>
            </header>

            <main className="px-4 py-6 md:px-7">
              <div className="mb-5" data-bot-target="health">
                <HealthPanel snapshot={snapshot} />
              </div>
              {children}
            </main>

            <footer className="px-4 pb-24 pt-4 text-[10.5px] text-faint md:px-7 md:pb-8">
              <p>
                Black Hole — le dashboard lit les mêmes artefacts que la
                documentation ({" "}
                <code className="text-accent">runs/benchmarks.jsonl</code>,{" "}
                <code className="text-accent">runs/bh-005/log.jsonl</code>,{" "}
                <code className="text-accent">docs/METRICS.md</code>) ; il ne
                calcule rien de plus.{" "}
                <Link href="/journal" className="text-accent underline underline-offset-2">
                  journal
                </Link>
              </p>

              {/* ── l'atelier du pied de page ───────────────────────
                 Les trois études Bencho qui n'ont pas de fonction à
                 tenir (la nav est le dock, la pause est le toggle du
                 header) vivent ici, sur TOUTES les pages : le
                 gardien veille sans jamais vous regarder faire,
                 la balle se traîne, le portefeuille cède et
                 rebondit. C'est la signature du site, pas une
                 vitrine séparée quelque part. */}
              <div className="mt-4 flex flex-wrap items-end justify-end gap-x-6 gap-y-2 border-t border-line pt-4">
                <EyeTracker idle size={64} />
                <DraggingBall size={48} />
                <PullToRefresh />
              </div>
            </footer>
          </div>
        </div>

        {/* ── le dock : la nav du mobile ────────────────────────
           Le rail est `hidden md:flex`, donc un téléphone n'a
           AUCUNE navigation. Le dock Bencho (cinq pages, magnétées)
           est fixé en bas sur mobile seulement — le rail reste
           seul maître sur desktop, deux navs actives se
           disputeraient le regard. Le footer porte `pb-24` pour
           que rien ne se cache sous lui. */}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-3 md:hidden">
          <div className="pointer-events-auto">
            <MagnifyingDock />
          </div>
        </div>

        {/* la pile de notifications du run, flottante en bas à
           droite — elle se déplie au survol, au-dessus du contenu,
           jamais dans le flux d'une page */}
        <div className="fixed bottom-5 right-5 z-30 hidden lg:block">
          <ToastStack />
        </div>
        </LiveProvider>
      </body>
    </html>
  );
}
