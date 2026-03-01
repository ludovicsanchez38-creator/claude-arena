import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import type { ServerMessage } from './types.js'
import { startScanner, getActiveAgentIds } from './scanner.js'
import {
  loadDefaultLayout,
  loadCharacterSprites,
  loadFloorTiles,
  loadWallTiles,
  loadFurnitureAssets,
} from './assetLoader.js'
import { PORT, LAYOUT_FILE_DIR, LAYOUT_FILE_NAME } from './constants.js'

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

// ── Assets ──────────────────────────────────────────────────
// Assets are in webview-ui/public/assets/ (dev) or dist/webview/assets/ (prod)
function findAssetsDir(): string {
  // Check dist/webview/assets/ first (production build)
  const distAssets = path.join(import.meta.dirname, '..', 'dist', 'webview', 'assets')
  if (fs.existsSync(distAssets)) return distAssets

  // Dev mode: webview-ui/public/assets/
  const devAssets = path.join(import.meta.dirname, '..', 'webview-ui', 'public', 'assets')
  if (fs.existsSync(devAssets)) return devAssets

  console.warn('[Server] No assets directory found')
  return devAssets // Fallback, may not exist
}

const assetsDir = findAssetsDir()
console.log(`[Server] Assets directory: ${assetsDir}`)

// Pre-load all assets at startup
const cachedLayout = loadDefaultLayout(assetsDir)
const cachedCharSprites = loadCharacterSprites(assetsDir)
const cachedFloorTiles = loadFloorTiles(assetsDir)
const cachedWallTiles = loadWallTiles(assetsDir)
const cachedFurniture = loadFurnitureAssets(assetsDir)

// ── Layout persistence ──────────────────────────────────────
function getLayoutFilePath(): string {
  const dir = path.join(os.homedir(), LAYOUT_FILE_DIR)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return path.join(dir, LAYOUT_FILE_NAME)
}

function readSavedLayout(): Record<string, unknown> | null {
  try {
    const layoutPath = getLayoutFilePath()
    if (!fs.existsSync(layoutPath)) return null
    return JSON.parse(fs.readFileSync(layoutPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeSavedLayout(layout: Record<string, unknown>): void {
  try {
    const layoutPath = getLayoutFilePath()
    const tmpPath = layoutPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(layout), 'utf-8')
    fs.renameSync(tmpPath, layoutPath)
  } catch (err) {
    console.error('[Server] Error saving layout:', err)
  }
}

// ── WebSocket ───────────────────────────────────────────────
const clients = new Set<WebSocket>()

function broadcastToAll(msg: ServerMessage): void {
  const data = JSON.stringify(msg)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws)
  console.log(`[WS] Client connected (${clients.size} total)`)

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[WS] Client disconnected (${clients.size} total)`)
  })

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      handleClientMessage(ws, msg)
    } catch {
      // Ignore malformed messages
    }
  })

  // Send initial state to new client
  sendInitialState(ws)
})

function sendToClient(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function sendInitialState(ws: WebSocket): void {
  // Send settings
  sendToClient(ws, { type: 'settingsLoaded', soundEnabled: true })

  // Send character sprites
  if (cachedCharSprites) {
    sendToClient(ws, { type: 'characterSpritesLoaded', characters: cachedCharSprites })
  }

  // Send floor tiles
  if (cachedFloorTiles) {
    sendToClient(ws, { type: 'floorTilesLoaded', sprites: cachedFloorTiles })
  }

  // Send wall tiles
  if (cachedWallTiles) {
    sendToClient(ws, { type: 'wallTilesLoaded', sprites: cachedWallTiles })
  }

  // Send furniture assets
  if (cachedFurniture) {
    sendToClient(ws, {
      type: 'furnitureAssetsLoaded',
      catalog: cachedFurniture.catalog,
      sprites: cachedFurniture.sprites,
    })
  }

  // Send layout (saved or default)
  const savedLayout = readSavedLayout()
  sendToClient(ws, { type: 'layoutLoaded', layout: savedLayout || cachedLayout })

  // Send existing agents
  const agentIds = getActiveAgentIds()
  if (agentIds.length > 0) {
    sendToClient(ws, { type: 'existingAgents', agents: agentIds })
  }
}

function handleClientMessage(ws: WebSocket, msg: Record<string, unknown>): void {
  if (msg.type === 'saveLayout') {
    writeSavedLayout(msg.layout as Record<string, unknown>)
  }
  // Other client messages can be handled here if needed
}

// ── Static files ────────────────────────────────────────────
// Serve the built webview-ui
const distWebview = path.join(import.meta.dirname, '..', 'dist', 'webview')
const devPublic = path.join(import.meta.dirname, '..', 'webview-ui')

if (fs.existsSync(distWebview)) {
  app.use(express.static(distWebview))
  console.log(`[Server] Serving production build from ${distWebview}`)
} else if (fs.existsSync(devPublic)) {
  // In dev mode, redirect to Vite dev server
  console.log(`[Server] Dev mode - frontend served by Vite on http://localhost:5173`)
}

// ── Start ───────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║         CLAUDE ARENA v1.0.0         ║
  ║                                     ║
  ║   http://localhost:${PORT}            ║
  ║   WebSocket: ws://localhost:${PORT}/ws ║
  ╚══════════════════════════════════════╝
  `)
})

// Start the session scanner
startScanner(broadcastToAll)
