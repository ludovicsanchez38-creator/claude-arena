// ── Timing (ms) ──────────────────────────────────────────────
export const SCAN_INTERVAL_MS = 1500
export const JSONL_STALE_THRESHOLD_MS = 1_800_000 // 30 min : garder les sessions inactives visibles
export const TOOL_DONE_DELAY_MS = 300
export const PERMISSION_TIMER_DELAY_MS = 7000
export const TEXT_IDLE_DELAY_MS = 5000

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 128
export const WALL_PIECE_WIDTH = 16
export const WALL_PIECE_HEIGHT = 32
export const WALL_GRID_COLS = 4
export const WALL_BITMASK_COUNT = 16
export const FLOOR_PATTERN_COUNT = 7
export const FLOOR_TILE_SIZE = 16
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const
export const CHAR_FRAME_W = 16
export const CHAR_FRAME_H = 32
export const CHAR_FRAMES_PER_ROW = 7
export const CHAR_COUNT = 6

// ── Server ──────────────────────────────────────────────────
export const PORT = 3847
/** Écoute en local seulement : aucune autre machine du réseau ne peut se connecter. */
export const HOST = '127.0.0.1'
/** Port du serveur Vite en développement (npm run dev), seule autre origine acceptée. */
export const DEV_PORT = 5173
export const LAYOUT_FILE_DIR = '.claude-arena'
export const LAYOUT_FILE_NAME = 'layout.json'
