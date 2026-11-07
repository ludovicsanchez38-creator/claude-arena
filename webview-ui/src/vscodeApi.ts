// WebSocket bridge that replaces VS Code's postMessage API
// The frontend code uses `vscode.postMessage()` and `window.addEventListener('message', ...)`
// This shim routes messages through a WebSocket connection to the backend

const WS_URL = `ws://${window.location.hostname}:${window.location.port || '3847'}/ws`

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let fetchingToken = false

// Le serveur exige un jeton de session, tiré à chaque démarrage. Il est relu
// avant chaque connexion : après un redémarrage du serveur, la page se
// reconnecte d'elle-même avec le nouveau jeton.
async function fetchSessionToken(): Promise<string | null> {
  try {
    const res = await fetch('./api/session', { cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { token?: unknown }
    return typeof body.token === 'string' ? body.token : null
  } catch {
    return null
  }
}

async function connect(): Promise<void> {
  if (fetchingToken) return
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  fetchingToken = true
  const token = await fetchSessionToken()
  fetchingToken = false
  if (!token) {
    scheduleReconnect()
    return
  }

  ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)

  ws.onopen = () => {
    console.log('[WS] Connected to server')
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      // Dispatch as a window message event (same as VS Code postMessage)
      window.dispatchEvent(new MessageEvent('message', { data: msg }))
    } catch {
      // Ignore malformed messages
    }
  }

  ws.onclose = () => {
    console.log('[WS] Disconnected, reconnecting in 2s...')
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose will be called after onerror
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void connect()
  }, 2000)
}

// Start connection immediately
void connect()

// VS Code API shim
export const vscode = {
  postMessage(msg: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  },
}
