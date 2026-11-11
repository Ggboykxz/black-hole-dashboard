"use client";

import { useCallback } from "react";
import { useLiveFeed } from "./live-provider";
import { freshness, humanAge, SIGNAL_META, STALE_AFTER_S } from "@/lib/signal";
import LiveVariations from "./variations";

interface Props {
  run: string;
  /** the embedded snapshot's timestamp, shown when no live source answers */
  generatedAt?: string;
  /** a six-metric strip for the synthesis page */
  compact?: boolean;
}

/**
 * The variation tracker's view of the shared live feed.
 *
 * It used to poll `/api/live` on its own; now it reads the same feed as the
 * header and the live page — one request, one journal, one age. The page
 * keeps its own rules:
 *
 * * one sample per **new measurement** (never per poll);
 * * the age of the signal is always recomputed from `updated_at`;
 * * a frozen source is labelled as such, and a dead one says so.
 */
export default function VariationsFeed({ run, generatedAt, compact = false }: Props) {
  const feed = useLiveFeed();
  const { live, samples, state, meta, age, error, source, restored } = feed;

  const sourceLabel: Record<string, string> = {
    local: "log local (vrai direct)",
    hub: "heartbeat Hub",
    snapshot: "instantané embarqué",
    cache: "journal local",
    none: "aucun signal",
  };
  const pulseColor = { ["--pulse-color" as string]: meta.color } as React.CSSProperties;

  const reset = useCallback(() => {
    feed.reset();
  }, [feed]);

  return (
    <div
      className="space-y-3"
      data-bot-target={compact ? undefined : "variations"}
    >
      <div className={compact ? "card px-4 py-3" : "card p-4"} style={pulseColor}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`pulse ${state === "live" ? "" : "pulse-static"}`}
              style={{ background: meta.color }}
              title={meta.hint}
            />
            <span
              className="text-[12px] font-medium tracking-wide"
              style={{ color: meta.color }}
            >
              {meta.label}
            </span>
            <span
              className={`chip ${
                source === "snapshot" || state === "none"
                  ? "!border-line !text-faint"
                  : source === "local"
                    ? "!border-good/40 !text-good"
                    : ""
              }`}
            >
              {sourceLabel[source] ?? source}
            </span>
            <span className="chip" title="âge du heartbeat, calculé depuis son updated_at">
              signal : {humanAge(age)}
            </span>
            {restored ? (
              <span className="chip !border-accent/30 !text-accent/90">
                journal restauré
              </span>
            ) : null}
            <span className="num text-[10.5px] text-dim">
              step{" "}
              <span className="text-ink">
                {(live?.step ?? 0).toLocaleString("fr-FR")}
              </span>
              {live?.max_steps
                ? ` / ${live.max_steps.toLocaleString("fr-FR")}`
                : ""}
            </span>
            {compact ? (
              <a
                href="/variations"
                className="chip !border-accent/35 !px-2 !py-[2px] !text-[9.5px] !text-accent"
              >
                traque complète →
              </a>
            ) : null}
          </div>
          <div className="font-mono text-[10px] text-faint">
            {live?.updated_at
              ? `heartbeat ${live.updated_at.replace("T", " ").slice(0, 19)} UTC`
              : generatedAt
                ? `instantané du ${generatedAt.replace("T", " ").slice(0, 19)} UTC`
                : ""}
          </div>
        </div>

        {/* the freshness meter — the one number that says how much to trust
            the row above. It falls with the producer's own age, not with the
            poll clock, so a dead heartbeat visibly runs down to zero. */}
        {state === "live" || state === "stale" ? (
          <div className="mt-2.5">
            <div className="flex items-center justify-between font-mono text-[9.5px] text-faint">
              <span>fraîcheur du signal</span>
              <span style={{ color: meta.color }}>
                {Math.round(freshness(age) * 100)} % · seuil {STALE_AFTER_S} s
              </span>
            </div>
            <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
                style={{
                  width: `${Math.round(freshness(age) * 100)}%`,
                  background: meta.color,
                }}
              />
            </div>
          </div>
        ) : null}

        {!compact ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] text-dim">
            <span>
              run <span className="text-ink">{run}</span> · {samples.length}{" "}
              échantillon{samples.length > 1 ? "s" : ""}
            </span>
            <span>la fenêtre glisse sur 10 min, rien n&apos;est réécrit</span>
          </div>
        ) : null}

        {state === "frozen" || state === "none" ? (
          <div className="mt-2 rounded-lg border border-bad/40 bg-bad/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-bad/90">
            <strong className="font-medium">Aucune source live.</strong>{" "}
            {state === "frozen" ? (
              <>
                <code className="text-accent">/api/live</code> répond avec
                l&apos;instantané figé du{" "}
                {(live?.updated_at ?? generatedAt ?? "")
                  .replace("T", " ")
                  .slice(0, 19)}{" "}
                UTC (step {(live?.step ?? 0).toLocaleString("fr-FR")}). Il
                n&apos;y a donc pas de nouvelle mesure à comparer : le tracking
                ne peut pas avancer.
              </>
            ) : (
              <>
                <code className="text-accent">/api/live</code> n&apos;a encore
                répondu aucune mesure exploitable
                {error ? (
                  <>
                    {" "}
                    (<span className="font-mono">{error}</span>)
                  </>
                ) : null}
                . La page n&apos;affiche donc aucune valeur de substitution.
              </>
            )}{" "}
            Sur Vercel, définir <code className="text-accent">HF_TOKEN</code> ou
            rendre <code className="text-accent">Ggboykxz/black-hole-live</code>{" "}
            public ; en local, vérifier{" "}
            <code className="text-accent">runs/bh-005/live.json</code>.
          </div>
        ) : state === "stale" ? (
          <p className="mt-2 rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-warn/90">
            <strong className="font-medium">Le producteur s&apos;est tu.</strong>{" "}
            Aucune nouvelle mesure depuis {humanAge(age)} : les chiffres
            affichés sont les <em>derniers reçus</em>, à leur valeur exacte.
            La courbe s&apos;arrête au lieu de se prolonger.
          </p>
        ) : state === "offline" ? (
          <p className="mt-2 rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-warn/90">
            La requête live a échoué{error ? (
              <>
                {" "}
                (<span className="font-mono">{error}</span>)
              </>
            ) : null}{" "}
            : la traque continue sur le journal local, avec l&apos;âge réel du
            dernier échantillon. Aucune valeur n&apos;est extrapolée entre deux
            mesures.
          </p>
        ) : null}
      </div>

      <LiveVariations
        live={live}
        samples={samples}
        offline={state === "offline" || state === "stale"}
        staticOnly={state === "frozen"}
        ageS={age}
        compact={compact}
        ledger={!compact}
        onReset={compact ? undefined : reset}
      />
    </div>
  );
}
