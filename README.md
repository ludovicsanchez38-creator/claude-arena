# Claude Arena

Dashboard pixel art qui affiche en temps réel les agents Claude Code actifs sous forme de personnages animés dans un bureau virtuel.

Fork standalone de [pixel-agents](https://github.com/pablodelucca/pixel-agents) (extension VS Code) transformé en app web autonome - pas besoin de VS Code.

![Claude Arena screenshot](webview-ui/public/Screenshot.jpg)

## Comment ça marche

1. Le serveur scanne `~/.claude/projects/` toutes les 1.5s
2. Il détecte les fichiers JSONL actifs (sessions Claude Code en cours)
3. Il parse le transcript en temps réel (outils, subagents, permissions)
4. Le frontend affiche un personnage pixel art par session active
5. Les personnages bougent, tapent, lisent selon l'activité de l'agent

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

- **Détection automatique** des sessions Claude Code actives via le filesystem
- **Personnages pixel art** animés (6 skins, marche/frappe/lecture)
- **Subagents** : les agents Task/Agent apparaissent comme des personnages enfants avec effet Matrix au spawn/despawn
- **Bulles de statut** : permission (ambre "..."), attente (checkmark vert), activité courante
- **Éditeur de bureau** : bouton Layout pour modifier sol, murs et meubles
- **Son** : notification quand un agent termine son tour
- **Zoom** : Ctrl+Scroll ou boutons +/-
- **Layout persisté** dans `~/.claude-arena/layout.json`

### Assets du bureau

Le tileset de meubles **[Office Interior Tileset](https://donarg.itch.io/officetileset)** par Donarg (2$ sur itch.io) n'est pas inclus dans ce repo. L'app fonctionne sans (layout par défaut + personnages), mais le catalogue complet de meubles nécessite le tileset importé. Voir le repo [pixel-agents](https://github.com/pablodelucca/pixel-agents) original pour la pipeline d'import.

Les personnages sont basés sur le travail de [JIK-A-4, Metro City](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Les 6 personnages" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Configuration

| Paramètre | Valeur | Fichier |
|-----------|--------|---------|
| Port HTTP/WS | `3847` | `server/constants.ts` |
| Intervalle de scan | `1.5s` | `server/constants.ts` |
| Session considérée inactive | `120s` sans écriture JSONL | `server/constants.ts` |
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
- **Rendu** : pixel-perfect a zoom entier, z-sort, BFS pathfinding
- **Communication** : WebSocket (`/ws`) - même protocole de messages que pixel-agents

## Origine

Basé sur [pixel-agents](https://github.com/pablodelucca/pixel-agents) par [Pablo De Lucca](https://github.com/pablodelucca) - MIT License.

Transformé en app web standalone par [Synoptia](https://synoptia.fr).

## Licence

[MIT](LICENSE)
