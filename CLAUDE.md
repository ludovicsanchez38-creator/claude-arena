# Claude Arena - Référence compressée

App web standalone : bureau pixel art où les sessions Claude Code actives sont des personnages animés.

Fork de [pixel-agents](https://github.com/pablodelucca/pixel-agents) - l'extension VS Code a été remplacée par un serveur Express + WebSocket.

## Architecture

```
server/                        — Backend Node.js (remplace src/ de pixel-agents)
  index.ts                     — Express + WebSocket server, chargement assets, dispatch messages
  scanner.ts                   — Scan ~/.claude/projects/*/*.jsonl toutes les 1.5s, crée/supprime agents
  transcriptParser.ts          — Parse JSONL : tool_use/tool_result/progress → messages WebSocket
  timerManager.ts              — Timers idle (5s) et permission (7s)
  assetLoader.ts               — PNG → SpriteData (pngjs), charge caractères/murs/sol/meubles
  constants.ts                 — Timing, parsing, port serveur (3847)
  types.ts                     — Interfaces : AgentState, ServerMessage, CharacterDirectionSprites

webview-ui/src/                — Frontend React + TypeScript (Vite)
  vscodeApi.ts                 — Shim WebSocket qui remplace acquireVsCodeApi(). Se connecte à ws://host:port/ws.
                                 Reçoit les messages serveur → window.dispatchEvent('message').
                                 Envoie les messages client → ws.send().
  App.tsx                      — Composition root, hooks + components
  constants.ts                 — Grid, animation, rendu, caméra, zoom, éditeur
  hooks/
    useExtensionMessages.ts    — Handler de tous les messages serveur, gère le state React (agents, tools, layout)
    useEditorActions.ts        — Éditeur de layout : undo/redo, paint, place, move, zoom
    useEditorKeyboard.ts       — Raccourcis clavier éditeur
  components/
    BottomToolbar.tsx           — Layout toggle, Settings button (pas de "+ Agent" en mode standalone)
    ZoomControls.tsx            — +/- zoom (haut-gauche)
    SettingsModal.tsx           — Son, debug toggle
    DebugView.tsx               — Overlay debug
  office/
    types.ts                   — OfficeLayout, Character, TileType, FloorColor, etc.
    toolUtils.ts               — STATUS_TO_TOOL mapping, extractToolName()
    colorize.ts                — Colorize (grayscale→HSL) + Adjust (HSL shift) pour sprites
    floorTiles.ts              — Cache des tiles de sol colorisés
    wallTiles.ts               — Auto-tile murs : 16 bitmask sprites
    sprites/
      spriteData.ts            — Données pixels : 6 personnages pré-colorés, fallback templates
      spriteCache.ts           — SpriteData → offscreen canvas, cache par zoom (WeakMap)
    editor/
      editorActions.ts         — Ops pures : paintTile, placeFurniture, removeFurniture, expandLayout
      editorState.ts           — État impératif : outils, ghost, sélection, undo/redo
      EditorToolbar.tsx        — Toolbar/palette pour le mode édition
    layout/
      furnitureCatalog.ts      — Catalogue dynamique depuis assets chargés
      layoutSerializer.ts      — OfficeLayout ↔ runtime
      tileMap.ts               — Walkability grid, BFS pathfinding
    engine/
      characters.ts            — FSM : idle/walk/type + wander AI, 4 directions
      officeState.ts           — Monde : layout, characters, seats, subagents
      gameLoop.ts              — requestAnimationFrame, delta time (cap 0.1s)
      renderer.ts              — Canvas : tiles, z-sort, overlays, éditeur
      matrixEffect.ts          — Effet Matrix (spawn/despawn) en digital rain vert
    components/
      OfficeCanvas.tsx          — Canvas, resize, DPR, mouse, drag, édition
      ToolOverlay.tsx           — Label d'activité au-dessus du personnage survolé
```

## Concepts clés

**Session** = fichier JSONL dans `~/.claude/projects/<project-hash>/`. **Agent** = personnage webview lié 1:1 à une session. **Subagent** = personnage enfant (ID négatif) créé quand un outil Task/Agent est détecté.

**Flux de données** : Scanner lit JSONL → transcriptParser génère des messages → broadcast WebSocket → frontend useExtensionMessages met à jour OfficeState + React state.

**Shim vscodeApi.ts** : Le code frontend n'a pas été réécrit - il utilise toujours `vscode.postMessage()` et `window.addEventListener('message', ...)`. Le shim WebSocket (`vscodeApi.ts`) route transparemment ces appels via WebSocket. C'est le point de jonction entre l'ancien code VS Code et le nouveau backend.

## Protocole WebSocket

Connexion : `ws://localhost:3847/ws`

À la connexion, le serveur envoie dans l'ordre :
1. `settingsLoaded` (son activé)
2. `characterSpritesLoaded` (6 personnages × 3 directions × 7 frames)
3. `floorTilesLoaded` (7 patterns si floors.png existe)
4. `wallTilesLoaded` (16 bitmask sprites)
5. `furnitureAssetsLoaded` (catalogue + sprites si furniture/ existe)
6. `layoutLoaded` (layout sauvegardé ou défaut)
7. `existingAgents` (IDs des agents actifs)

Messages en continu :
- `agentCreated` / `agentClosed` : cycle de vie
- `agentToolStart` / `agentToolDone` / `agentToolsClear` : outils
- `agentStatus` (active/waiting) : état
- `agentToolPermission` / `agentToolPermissionClear` : permission
- `subagentToolStart` / `subagentToolDone` / `subagentClear` : subagents

Client → serveur :
- `saveLayout` : persiste le layout modifié dans `~/.claude-arena/layout.json`

## Scanner (server/scanner.ts)

- Scanne `~/.claude/projects/` récursivement toutes les 1.5s
- Un fichier JSONL modifié il y a moins de 120s = session active
- Crée un `AgentState` avec offset fichier, lit les nouvelles lignes à chaque scan
- Pour les fichiers gros (>50ko), ne lit que les derniers 50ko au premier scan
- Quand un JSONL n'est plus modifié depuis >120s → `agentClosed`

## Parsing JSONL (server/transcriptParser.ts)

Types de records JSONL parsés :
- `assistant` + `tool_use` blocks → `agentToolStart` pour chaque outil
- `user` + `tool_result` blocks → `agentToolDone` pour chaque résultat
- `system` + `subtype: "turn_duration"` → signal fiable de fin de tour → `agentStatus: waiting`
- `progress` + `data.type: "agent_progress"` → activité subagent (tool_use/tool_result forwarded)
- `progress` + `data.type: "bash_progress"` / `"mcp_progress"` → redémarre le timer permission

Outils exemptés de permission : `Task`, `AskUserQuestion` (l'utilisateur interagit déjà).

Détection idle : si un tour n'utilise aucun outil (texte seul), un timer de 5s se déclenche. Annulé par toute nouvelle donnée JSONL.

## Personnages

- 6 skins pré-colorés (`char_0.png` à `char_5.png`), chacun 112×96 (7 frames × 16px, 3 directions × 32px)
- FSM : idle (wander aléatoire BFS) → active (pathfind vers siège, animation type/read selon l'outil)
- Au-delà de 6 agents : même skin + hue shift aléatoire (45-315°)
- Subagents : ID négatif, même palette que le parent, spawn au siège libre le plus proche

## Layout

- Modèle : `{ version: 1, cols, rows, tiles: TileType[], furniture: PlacedFurniture[], tileColors?: FloorColor[] }`
- Grille dynamique, expansible jusqu'à 64×64
- Persisté dans `~/.claude-arena/layout.json` (atomic write via .tmp + rename)
- Éditeur : undo/redo 50 niveaux, outils SELECT/FLOOR/WALL/ERASE/FURNITURE/PICK/EYEDROPPER

## Build & Dev

```sh
npm install && cd webview-ui && npm install && cd ..
npm start          # build + serve production
npm run dev        # vite (hot reload) + tsx --watch
npm run server     # serveur seul (tsx)
```

Port : 3847. En dev, Vite (5173) proxy le WebSocket vers 3847.

## Contraintes TypeScript

- `noUnusedLocals` / `noUnusedParameters` dans le frontend
- `import type` pour les imports type-only
- Pas d'`enum` dans le frontend (`erasableSyntaxOnly`) → `as const` objects

## Constantes

Toutes centralisées, jamais de magic numbers inline :
- **Backend** : `server/constants.ts`
- **Frontend** : `webview-ui/src/constants.ts`
- **CSS** : `webview-ui/src/index.css` `:root` → variables `--pixel-*`
