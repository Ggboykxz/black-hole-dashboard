# Black Hole — dashboard live

> Le tableau de bord du run **bh-005** : un `next dev` sur la machine qui
> entraîne, un déploiement Vercel pour le suivre depuis n'importe où.

![stack](https://img.shields.io/badge/Next-16-38bdf8) ![react](https://img.shields.io/badge/React-19-a78bfa) ![data](https://img.shields.io/badge/données-artefacts-34d399)

## Ce qu'il montre

| page | contenu |
|---|---|
| `/` | synthèse : statut, les deux séries (officielle + raisonnement), les mesures de capacité, les trous ouverts, l'avatar et les bots |
| `/live` | **le direct** : la courbe qui grandit en temps réel, le GPU (avec son historique de température et d'horloge), les processus, les checkpoints, le flux d'événements, l'assistant |
| `/analyse` | ce que les artefacts **impliquent** : pente, volatilité, extrapolation (dite comme telle), distance aux portes, budget Chinchilla, bilan des prédictions — chaque dérivation affiche sa méthode |
| `/roadmap` | les prochaines étapes, **dérivées des artefacts** : jalons d'entraînement, mesures à faire, hypothèses ouvertes, publication |
| `/comparaison` | tous les runs sur la même courbe officielle, les checkpoints, la série secondaire |
| `/entrainement` | la recette, la perte train/val, le schedule LR (avec la couture du step 8 000), le grad-norm, la cadence, les tokens |
| `/metriques` | le registre M1–M14 : définition, producteur, artefact, step, comparabilité, limites |
| `/predictions` | P1–P14 : la prédiction, la commande qui la tranche, l'état |
| `/donnees` | la provenance du corpus (tokens, parts, SHA-256, part CoT) et les jeux SFT |
| `/echantillons` | les générations (qualitatif — jamais une métrique) |
| `/runbook` | les règles d'or, les pièges, la procédure de reprise |
| `/journal` | le changelog complet |

Quatre composants d'interaction :

- **l'avatar** — lié aux mesures réelles (le souffle suit le rythme, la
  chaleur suit la température GPU) ;
- **les bots-minions** — une boule animée par acteur du système, chacune
  avec son état, son anneau de progression et l'action à mener ; ils se
  déplacent seuls, on peut les attraper et les lancer ;
- **l'assistant** — répond aux questions sur le run **uniquement** à partir
  des artefacts, en citant son fichier source (une question hors artefacts
  est refusée, pas approximée) ;
- **le panneau de santé** — dit si la session est vivante, et **ce qu'il
  faut relancer** si elle ne l'est pas (trainer mort, keepalive arrêté, GPU
  disparu, disque plein, cadence dégradée) ;
- **les notifications** — une cloche, des toasts et (sur autorisation) des
  notifications du navigateur, déclenchées par des **règles de mesures** :
  température GPU, bridage de puissance, effondrement de l'horloge, VRAM,
  cadence, disque, documentation figée — chaque alerte porte l'action à
  mener.

## Le principe : un seul producteur

Le dashboard **ne parse aucun artefact**. Il affiche
`dashboard/public/data/snapshot.json`, produit par
`scripts/dashboard_snapshot.py` — qui réutilise les fonctions de
`scripts/metrics_ledger.py`, donc les mêmes filtres, donc exactement les
chiffres publiés dans le README et `docs/METRICS.md`.

> *Une métrique, un producteur.* Un dashboard qui re-découpe les données en
> JavaScript deviendrait un deuxième producteur — et divergerait au premier
> changement.

Le « direct » a deux modes, et l'interface dit lequel parle :

| mode | latence | source |
|---|---|---|
| **local** (sur la machine qui entraîne) | ~26 s | `app/api/live/route.ts` lit `runs/<run>/log.jsonl` à chaque requête + `nvidia-smi` |
| **Hub** (déployé sur Vercel) | ~30 s | heartbeat `live.json` publié par `scripts/live_sync.py` |

## Lancer en local

```bash
npm install
npm run dev            # http://localhost:3000
```

Sur Colab, le port est exposé par le proxy du notebook :
`https://<notebook>-3000.<user>.googleusercontent.com`.

> Pendant un entraînement, `npm install` et `npm run build` sont **CPU** :
> `nice -n 19` sinon (mesuré : 2,60 → 2,90 s/step pendant le build).

## Déployer sur Vercel

1. **Import Project** → ce dépôt → preset *Next.js*.
2. Variables d'environnement :

   | variable | valeur | pourquoi |
   |---|---|---|
   | `HF_TOKEN` | jeton `read` | le dépôt de sauvegarde est **privé** : sans jeton, le dashboard retombe sur l'instantané embarqué (données plus fraîches) |
   | `HF_REPO` | `Ggboykxz/black-hole-100m-backup` | dépôt de la sauvegarde |
   | `HF_LIVE_REPO` | `Ggboykxz/black-hole-live` | dépôt du heartbeat |
   | `DASHBOARD_RUN` | `bh-005` | run affiché |
   | `DASHBOARD_REVALIDATE` | `60` | secondes entre deux revalidations ISR |

3. Deploy. Le contenu se met à jour **tout seul** : le keepalive réécrit
   l'instantané à chaque cycle et le pousse sur le Hub ; l'application le
   revalide chaque minute et rafraîchit la page quand le run avance.

## Publier une mise à jour

```bash
export GH_TOKEN=…                     # jamais dans un fichier
git add -A && git commit -m "…" && git push
```

L'instantané (`public/data/snapshot.json`) est versionné ici : c'est lui qui
permet au site de fonctionner **sans** jeton et **sans** réseau.

## Licence & provenance

Code : Black Hole (projet). Données : les artefacts publics du dépôt
`Ggboykxz/black-hole-100m-backup` (FineWeb, NuminaMath-CoT, GSM8K).
Le détail des protocoles : `docs/METRICS.md` et `docs/EVALUATION.md` du
projet principal.
