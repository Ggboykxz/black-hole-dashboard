import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/nav";
import AutoRefresh from "@/components/auto-refresh";
import HealthPanel from "@/components/health";
import Notifications from "@/components/notifications";
import Copilot from "@/components/copilot";
import LiveHeader, { RailStatus } from "@/components/live-header";
import { LiveProvider } from "@/components/live-provider";
import SignalRibbon from "@/components/signal-ribbon";
import { getSnapshot } from "@/lib/snapshot";

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
    <html lang="fr">
      <body>
        <LiveProvider
          initialRows={snapshot.series.train.map((p) => ({ step: p.step, loss: p.loss }))}
          initialVals={snapshot.series.val.map((p) => ({ step: p.step, loss: p.loss }))}
        >
        <AutoRefresh />
        <SignalRibbon />
        <Copilot snapshot={snapshot} />
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
              <div className="shrink-0 pr-4 md:pr-7">
                <Notifications snapshot={snapshot} />
              </div>
            </header>

            <main className="px-4 py-6 md:px-7">
              <div className="mb-5" data-bot-target="health">
                <HealthPanel snapshot={snapshot} />
              </div>
              {children}
            </main>

            <footer className="px-4 pb-8 pt-4 text-[10.5px] text-faint md:px-7">
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
            </footer>
          </div>
        </div>
        </LiveProvider>
      </body>
    </html>
  );
}
