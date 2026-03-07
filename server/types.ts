// Types partagés entre le serveur et le frontend (via WebSocket)

export interface AgentState {
  id: number
  pid: number | null
  projectDir: string
  jsonlFile: string
  fileOffset: number
  lineBuffer: string
  activeToolIds: Set<string>
  activeToolStatuses: Map<string, string>
  activeToolNames: Map<string, string>
  activeSubagentToolIds: Map<string, Set<string>>
  activeSubagentToolNames: Map<string, Map<string, string>>
  isWaiting: boolean
  permissionSent: boolean
  hadToolsInTurn: boolean
  lastActivity: number
}

// Messages envoyés du serveur vers le frontend via WebSocket
export type ServerMessage =
  | { type: 'agentCreated'; id: number; projectName?: string }
  | { type: 'agentClosed'; id: number }
  | { type: 'existingAgents'; agents: number[]; projectNames?: Record<number, string> }
  | { type: 'agentToolStart'; id: number; toolId: string; status: string }
  | { type: 'agentToolDone'; id: number; toolId: string }
  | { type: 'agentToolsClear'; id: number }
  | { type: 'agentStatus'; id: number; status: string }
  | { type: 'agentToolPermission'; id: number }
  | { type: 'agentToolPermissionClear'; id: number }
  | { type: 'subagentToolStart'; id: number; parentToolId: string; toolId: string; status: string }
  | { type: 'subagentToolDone'; id: number; parentToolId: string; toolId: string }
  | { type: 'subagentToolPermission'; id: number; parentToolId: string }
  | { type: 'subagentClear'; id: number; parentToolId: string }
  | { type: 'characterSpritesLoaded'; characters: CharacterDirectionSprites[] }
  | { type: 'floorTilesLoaded'; sprites: string[][][] }
  | { type: 'wallTilesLoaded'; sprites: string[][][] }
  | { type: 'furnitureAssetsLoaded'; catalog: FurnitureAssetMeta[]; sprites: Record<string, string[][]> }
  | { type: 'layoutLoaded'; layout: Record<string, unknown> | null }
  | { type: 'settingsLoaded'; soundEnabled: boolean }
  | { type: 'claudeMetaLoaded'; hooks: PluginHooks[]; commands: CommandDefinition[]; skills: SkillDefinition[]; infrastructure: Infrastructure }

export interface CharacterDirectionSprites {
  down: string[][][]
  up: string[][][]
  right: string[][][]
}

// ── Claude Meta (hooks, skills, commands) ───────────────────

export interface HookDefinition {
  event: string
  matcher: string
  command: string
  async: boolean
}

export interface PluginHooks {
  pluginName: string
  hooks: HookDefinition[]
}

export interface CommandDefinition {
  name: string
  description: string
}

export interface SkillDefinition {
  name: string
  description: string
}

// ── Infrastructure (agents, services, crons) ────────────────

export interface InfraAgent {
  name: string
  host: string
  ip: string
  model: string | null
  channels: string[]
  workspace: string
  status: string
}

export interface InfraService {
  name: string
  host: string
  ip: string
  type: string
  description: string
}

export interface InfraCron {
  schedule: string
  command: string
  host: string
  description: string
}

export interface Infrastructure {
  agents: InfraAgent[]
  services: InfraService[]
  crons: InfraCron[]
}

export interface FurnitureAssetMeta {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  orientation?: string
  state?: string
}
