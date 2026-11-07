# Claude Arena

Dashboard temps réel qui affiche les sessions Claude Code actives sous forme de personnages animés dans un bureau pixel art, avec un panneau de contrôle complet (skills, commandes, agents, services, crons).

Fork standalone de [pixel-agents](https://github.com/pablodelucca/pixel-agents) (extension VS Code) transformé en app web autonome - pas besoin de VS Code.

![Claude Arena screenshot](webview-ui/public/Screenshot.jpg)

## Comment ça marche

1. Le serveur scanne `~/.claude/projects/` toutes les 1.5s
2. Il détecte les fichiers JSONL actifs (sessions Claude Code en cours)
3. Il parse le transcript en temps réel (outils, subagents, permissions)
4. Le frontend affiche un personnage pixel art par session active
5. Les personnages bougent, tapent, lisent selon l'activité de l'agent
6. Le panneau Info affiche skills, commandes, hooks, agents, services et crons

Aucune modification de Claude Code n'est nécessaire - c'est purement observationnel.

## Installation

```bash
git clone https://github.com/ludovicsanchez38-creator/claude-arena.git
cd claude-arena
npm install
cd webview-ui && npm install && cd ..
```

## Utilisation

### Mode production

```bash
npm start
# Build + serve sur http://localhost:3847
```

### Mode développement

```bash
npm run dev
# Vite dev server (hot reload) + serveur backend (watch)
# Frontend : http://localhost:5173 (proxy WS vers 3847)
# Backend  : http://localhost:3847
```

### Serveur seul (sans rebuild)

```bash
npm run server
# Sert le dernier build depuis dist/webview/
```

Puis ouvrir **http://localhost:3847** dans un navigateur.

## Fonctionnalités

### Bureau pixel art
- **Détection automatique** des sessions Claude Code actives via le filesystem
- **Personnages pixel art** animés (6 skins, marche/frappe/lecture)
- **Subagents** : les agents Task/Agent apparaissent comme des personnages enfants avec effet Matrix au spawn/despawn
- **Bulles de statut** : permission (ambre "..."), attente (checkmark vert), activité courante
- **Éditeur de bureau** : bouton Layout pour modifier sol, murs et meubles
- **Son** : notification quand un agent termine son tour
- **Zoom** : Ctrl+Scroll ou boutons +/-
- **Layout persisté** dans `~/.claude-arena/layout.json`

### Panneau Info (7 onglets)
- **Live** : sessions Claude Code actives en temps réel, avec nom du projet et statut (actif/en attente)
- **Skills** : tous les skills détectés dans `~/.claude/skills/` avec description et bouton copier
- **Commandes** : toutes les commandes détectées dans `~/.claude/commands/`
- **Bots** : agents IA configurés (depuis `~/.claude-arena/infrastructure.json`)
- **Services** : services systemd/docker (depuis le même fichier)
- **Crons** : tâches planifiées (config + crontab locale)
- **Hooks** : hooks de plugins détectés dans `~/.claude/plugins/cache/`

Le scanner meta tourne toutes les 30s. Le scanner de sessions toutes les 1.5s.

### Architecture multi-theme
- Moteur de rendu abstrait derrière une interface `RenderTheme`
- Theme actuel : Pixel Classic (le rendu original)
- Sélecteur de thème dans Settings (persiste dans localStorage)
- Prêt pour ajouter de nouveaux themes (glass, neon, etc.)

### Noms de sessions personnalisés
Le `/rename` de Claude Code ne persiste pas dans les fichiers. Pour nommer vos sessions dans Arena, créez `~/.claude-arena/session-names.json` :
```json
{
  "mon-slug-de-session": "Mon Projet",
  "uuid-de-session": "Autre Projet"
}
```
Le slug se trouve dans les fichiers JSONL de `~/.claude/projects/`.

### Sécurité

Claude Arena lit en temps réel vos sessions Claude Code, votre crontab locale, et le contenu de `~/.claude-arena/infrastructure.json`. Trois verrous protègent ces données :

- **Écoute locale** : le serveur n'écoute que sur `127.0.0.1`. Une autre machine du réseau ne peut pas s'y connecter.
- **Origine contrôlée** : le WebSocket refuse toute connexion dont l'en-tête `Origin` n'est pas l'adresse locale de l'outil (`http://localhost:3847` ou `http://127.0.0.1:3847`, et `:5173` pour le serveur Vite en mode développement). Une page web ouverte dans votre navigateur ne peut donc pas lire votre activité.
- **Jeton de session** : un jeton tiré au hasard à chaque démarrage du serveur est exigé pour ouvrir le WebSocket. La page servie par l'outil le lit auprès du serveur (`/api/session`, sans en-tête CORS, en-tête `Host` local exigé) ; une page d'une autre origine ne peut pas le lire.

L'outil n'a pas de comptes utilisateurs : n'exposez jamais le port 3847 sur un réseau (tunnel, reverse proxy, redirection de port).

### Assets du bureau

Le tileset de meubles **[Office Interior Tileset](https://donarg.itch.io/officetileset)** par Donarg (2$ sur itch.io) n'est pas inclus dans ce repo. L'app fonctionne sans (layout par défaut + personnages), mais le catalogue complet de meubles nécessite le tileset importé. Voir le repo [pixel-agents](https://github.com/pablodelucca/pixel-agents) original pour la pipeline d'import.

Les personnages sont basés sur le travail de [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Les 6 personnages" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Configuration

| Paramètre | Valeur | Fichier |
|-----------|--------|---------|
| Adresse d'écoute | `127.0.0.1` | `server/constants.ts` |
| Port HTTP/WS | `3847` | `server/constants.ts` |
| Intervalle de scan | `1.5s` | `server/constants.ts` |
| Session considérée inactive | `30min` sans écriture JSONL | `server/constants.ts` |
| Timer permission | `7s` sans données | `server/constants.ts` |
| Timer idle (texte seul) | `5s` sans données | `server/constants.ts` |
| Fichier layout | `~/.claude-arena/layout.json` | `server/constants.ts` |

## Différences avec pixel-agents

| pixel-agents (VS Code) | Claude Arena (standalone) |
|------------------------|--------------------------|
| Extension VS Code | App web Node.js |
| Crée des terminaux Claude Code | Détecte les sessions existantes |
| `postMessage` VS Code | WebSocket bidirectionnel |
| Layout dans `~/.pixel-agents/` | Layout dans `~/.claude-arena/` |
| Bouton "+ Agent" lance Claude | Pas de lancement - observation pure |
| Nécessite VS Code | Navigateur quelconque |

## Stack technique

- **Backend** : Node.js, Express, ws, pngjs, TypeScript
- **Frontend** : React 19, Canvas 2D, Vite, TypeScript
- **Rendu** : pixel-perfect à zoom entier, z-sort, BFS pathfinding
- **Communication** : WebSocket (`/ws`) - même protocole de messages que pixel-agents

## Origine

Basé sur [pixel-agents](https://github.com/pablodelucca/pixel-agents) par [Pablo De Lucca](https://github.com/pablodelucca) - MIT License.

Transformé en app web standalone par [Synoptia](https://synoptia.fr).

## Licence

[MIT](LICENSE)
