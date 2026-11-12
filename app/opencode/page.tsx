import OpenCodeChat from "@/components/opencode-chat";

export const revalidate = 0;

export default function OpenCodePage() {
  return (
    <div className="space-y-5" data-bot-target="opencode">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-ink">
          OpenCode en direct
        </h1>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-dim">
          Le service OpenCode de cette machine, lu dans le navigateur : les
          sessions en cours, les messages qui s&apos;écrivent, les outils que
          l&apos;agent appelle et les permissions qu&apos;il demande. On peut
          aussi le piloter — écrire, interrompre, changer de modèle ou
          d&apos;agent, répondre à une demande de permission.
        </p>
        <p className="mt-2 max-w-3xl border-l-2 border-warn/40 pl-2.5 text-[11px] leading-relaxed text-faint">
          Le poste est <strong className="text-dim">verrouillé par
          défaut</strong> : le serveur n&apos;accepte aucune commande sans{" "}
          <code className="text-accent">OPENCODE_KEY</code>, et le service
          OpenCode exige lui-même son mot de passe — qui reste côté serveur,
          jamais dans le dépôt ni dans le navigateur. Sur un déploiement
          public (Vercel), le poste n&apos;est simplement pas là.
        </p>
      </div>

      <OpenCodeChat />
    </div>
  );
}
