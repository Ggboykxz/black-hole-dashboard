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
| `/opencode` | **le poste de pilotage** : le chat OpenCode en direct (sessions, messages, outils, permissions) et les commandes pour le piloter — verrouillé par défaut |

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

Le réseau du dashboard interroge `/api/live` **toutes les 1 s**. Entre deux
réponses, l'horloge UTC, l'âge du signal et les barres de fraîcheur sont
recalculés localement à ~10 Hz (`requestAnimationFrame`) : l'interface bouge
en millisecondes, mais elle n'invente aucune mesure — la cadence du réseau,
la latence mesurée et l'âge du producteur restent affichés séparément.
Côté serveur, `nvidia-smi` et `ps` sont mis en cache 2 s pour qu'un poll par
seconde ne lance pas deux processus par seconde sur la boîte du trainer.

## Le poste de pilotage OpenCode (`/opencode`)

OpenCode fonctionne en **client/serveur** : le TUI, le SDK et son API HTTP
parlent tous au même service de fond, qui possède les sessions, les outils
et les permissions. `/opencode` est un **second client** de ce service : il
montre les conversations en cours et permet de les piloter (écrire,
interrompre, changer de modèle ou d'agent, répondre à une demande de
permission).

C'est la seule partie du dashboard qui **agit** au lieu de lire — donc la
seule qui soit verrouillée :

| condition | ce qui se passe |
|---|---|
| `OPENCODE_KEY` absent de l'environnement | le poste est **désactivé** : l'API répond `503`, la page explique pourquoi |
| `OPENCODE_KEY` défini, clé absente ou fausse | `401` — le poste reste verrouillé |
| clé correcte | le poste s'ouvre ; la clé reste dans le `localStorage` du navigateur |

Le mot de passe du service OpenCode, lui, **ne quitte jamais le serveur** :
il est lu à l'exécution dans `OPENCODE_PASSWORD` ou dans
`~/.config/opencode/service.json`. Il n'est ni écrit dans le dépôt, ni
envoyé au navigateur, ni journalisé. L'URL du service vient de
`OPENCODE_URL`, sinon de `opencode service status` (mis en cache 30 s).

```bash
OPENCODE_KEY=…            # obligatoire pour ouvrir le poste (jamais dans un fichier)
OPENCODE_URL=…            # optionnel : http://127.0.0.1:4096 par défaut si absent
OPENCODE_DIRECTORY=/content # optionnel : le répertoire de travail des nouvelles sessions
OPENCODE_PASSWORD=…       # optionnel : sinon ~/.config/opencode/service.json
```

Sur un déploiement public (Vercel), le poste n'existe pas : il n'y a pas de
service OpenCode derrière, et `OPENCODE_KEY` n'y est pas défini.

### Le suivi automatique

Le poste n'est **pas attaché à un id de session** : les sessions changent,
les environnements diffèrent. Le service marque celles qu'il fait tourner
(`GET /api/session/active`) — le poste suit donc **la session en cours** et
la rejoint dès qu'elle reprend, quel que soit son répertoire. Sans session
en cours, il suit la dernière session touchée.

Une session peut être **épinglée** (on veut watching celle-là) ; le bouton
« ⟳ suivi auto » rend la main à la machine. Les requêtes au service
portent la session suivie **et son répertoire** : les agents, les modèles,
les commandes et les permissions demandés sont ceux de cet environnement.

Le fil est relu **toutes les secondes** — la cadence du dashboard — plutôt
que par un flux permanent : une connexion coupée est un poll perdu, pas une
page cassée.

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
   | `HF_TOKEN` | jeton `read` (optionnel) | le dépôt de sauvegarde est **public** depuis le 2026-11-12 ; le jeton ne sert plus qu'aux dépôts privés. Sans lui, le dashboard retombe sur l'instantané embarqué |
   | `HF_REPO` | `Ggboykxz/black-hole-100m-backup` | dépôt de la sauvegarde |
   | `HF_LIVE_REPO` | `Ggboykxz/black-hole-live` | dépôt du heartbeat |
   | `DASHBOARD_RUN` | `bh-005` | run affiché |
   | `DASHBOARD_REVALIDATE` | `60` | secondes entre deux revalidations ISR |
   | `OPENCODE_KEY` | secret (optionnel) | ouvre le poste de pilotage `/opencode`. **Sans lui, le poste n'existe pas** — c'est le comportement voulu sur un déploiement public |

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
