// WebSocket bridge that replaces VS Code's postMessage API
// The frontend code uses `vscode.postMessage()` and `window.addEventListener('message', ...)`
// This shim routes messages through a WebSocket connection to the backend

const WS_URL = `ws://${window.location.hostname}:${window.location.port || '3847'}/ws`

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function connect(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  ws = new WebSocket(WS_URL)

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
    connect()
  }, 2000)
}

// Start connection immediately
connect()

// VS Code API shim
export const vscode = {
  postMessage(msg: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  },
}
