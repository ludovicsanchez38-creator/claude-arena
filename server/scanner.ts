import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import type { AgentState, ServerMessage } from './types.js'
import type { BroadcastFn } from './timerManager.js'
import { processTranscriptLine } from './transcriptParser.js'
import {
  cancelWaitingTimer,
  cancelPermissionTimer,
  clearAgentActivity,
} from './timerManager.js'
import { SCAN_INTERVAL_MS, JSONL_STALE_THRESHOLD_MS } from './constants.js'

const SESSION_NAMES_FILE = path.join(os.homedir(), '.claude-arena', 'session-names.json')

/** Load custom session name mapping (slug or sessionId → display name) */
function loadSessionNames(): Record<string, string> {
  try {
    if (fs.existsSync(SESSION_NAMES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SESSION_NAMES_FILE, 'utf-8'))
      const result: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith('_') || typeof v !== 'string') continue
        result[k] = v
      }
      return result
    }
  } catch { /* ignore */ }
  return {}
}

// Claude Code project dir: ~/.claude/projects/<project-hash>/
// Project hash = workspace path with :/\ → -
function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

// State
const agents = new Map<number, AgentState>()
const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>()
const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>()
const knownJsonlFiles = new Map<string, number>() // jsonlPath → agentId
let nextAgentId = 1
let broadcast: BroadcastFn = () => {}

export function getAgents(): Map<number, AgentState> {
  return agents
}

export function getActiveAgentIds(): number[] {
  return [...agents.keys()]
}

/** Extract a human-readable project name from the project hash directory.
 *  Hash format: path with / replaced by -, e.g. "-Users-synoptia-Desktop-Dev-claude-arena" */
function projectNameFromHash(hash: string): string {
  const segments = hash.split('-').filter(Boolean)
  if (segments.length === 0) return '/'
  // Remove "Users-<username>" prefix if present
  const homeUser = os.userInfo().username
  let idx = 0
  if (segments[0] === 'Users' && segments[1] === homeUser) idx = 2
  const rest = segments.slice(idx)
  if (rest.length === 0) return '~'
  // Return last 2 meaningful segments joined
  // e.g., "Desktop-Dev-Synoptia-claude-arena" → "claude-arena"
  // e.g., "Desktop-Docs-officiels-ARTICLE" → "ARTICLE"
  return rest.slice(-1)[0] || '~'
}

/** Extract a readable session name from JSONL.
 *  Priority: 1) session-names.json mapping, 2) cwd, 3) slug humanized, 4) hash */
function extractSessionName(jsonlFile: string, projectDir: string): string {
  const homeDir = os.homedir()
  const nameMap = loadSessionNames()

  try {
    const fd = fs.openSync(jsonlFile, 'r')
    const fstat = fs.fstatSync(fd)
    const readSize = Math.min(fstat.size, 10000)
    const buf = Buffer.alloc(readSize)
    fs.readSync(fd, buf, 0, readSize, Math.max(0, fstat.size - readSize))
    fs.closeSync(fd)
    const text = buf.toString('utf-8')

    // 0. Try custom name mapping (slug or sessionId → name from session-names.json)
    const slugMatches = text.match(/"slug":"([^"]+)"/g)
    let slug = ''
    if (slugMatches && slugMatches.length > 0) {
      const lastSlug = slugMatches[slugMatches.length - 1].match(/"slug":"([^"]+)"/)
      if (lastSlug) slug = lastSlug[1]
    }
    if (slug && nameMap[slug]) {
      return nameMap[slug]
    }
    // Also try sessionId mapping (for sessions without slug)
    const sidMatch = text.match(/"sessionId":"([^"]+)"/)
    const sessionId = sidMatch ? sidMatch[1] : ''
    if (sessionId && nameMap[sessionId]) {
      return nameMap[sessionId]
    }
    // Also try JSONL filename (UUID) as key
    const fileUuid = path.basename(jsonlFile, '.jsonl')
    if (nameMap[fileUuid]) {
      return nameMap[fileUuid]
    }

    // 1. Try cwd - most meaningful for project-based sessions
    const cwdMatches = text.match(/"cwd":"([^"]+)"/g)
    if (cwdMatches && cwdMatches.length > 0) {
      const lastCwd = cwdMatches[cwdMatches.length - 1].match(/"cwd":"([^"]+)"/)
      if (lastCwd) {
        const cwd = lastCwd[1]
        if (cwd !== homeDir && cwd.startsWith(homeDir + '/')) {
          const rel = cwd.slice(homeDir.length + 1)
          const parts = rel.split('/')
          const skip = ['Desktop', 'Dev Synoptia', 'Documents', 'Docs officiels']
          let start = 0
          while (start < parts.length - 1 && skip.includes(parts[start])) start++
          const meaningful = parts.slice(start)
          return meaningful.length > 2 ? meaningful.slice(0, 2).join('/') : meaningful.join('/')
        } else if (cwd !== homeDir) {
          return path.basename(cwd)
        }
      }
    }

    // 2. Humanize slug
    if (slug) {
      return slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }
  } catch {
    // Ignore read errors
  }

  // 3. Fallback to project hash
  return projectNameFromHash(path.basename(projectDir))
}

export function getAgentProjectNames(): Record<number, string> {
  const result: Record<number, string> = {}
  for (const [id, agent] of agents) {
    result[id] = extractSessionName(agent.jsonlFile, agent.projectDir)
  }
  return result
}

export function startScanner(broadcastFn: BroadcastFn): void {
  broadcast = broadcastFn
  console.log('[Scanner] Starting session scanner...')

  // Initial scan
  scan()

  // Periodic scan
  setInterval(scan, SCAN_INTERVAL_MS)
}

function scan(): void {
  const now = Date.now()
  const projectsDir = getClaudeProjectsDir()

  if (!fs.existsSync(projectsDir)) return

  // Find all active JSONL files across all project dirs
  const activeJsonlFiles = new Set<string>()

  try {
    const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const projDir of projectDirs) {
      const projPath = path.join(projectsDir, projDir.name)

      // Scan main JSONL files in this project dir
      try {
        const files = fs.readdirSync(projPath)
          .filter(f => f.endsWith('.jsonl'))

        for (const file of files) {
          const filePath = path.join(projPath, file)
          try {
            const stat = fs.statSync(filePath)
            const age = now - stat.mtimeMs

            if (age < JSONL_STALE_THRESHOLD_MS && stat.size > 1000) {
              activeJsonlFiles.add(filePath)

              if (!knownJsonlFiles.has(filePath)) {
                // New active session detected
                createAgent(filePath, projPath)
              } else {
                // Existing agent - read new lines
                const agentId = knownJsonlFiles.get(filePath)!
                readNewLines(agentId)
              }
            }
          } catch {
            // File may have been deleted between readdir and stat
          }
        }
      } catch {
        // Project dir may not be readable
      }
    }
  } catch {
    // Projects dir not readable
  }

  // Remove stale agents (JSONL not modified recently)
  for (const [filePath, agentId] of knownJsonlFiles) {
    if (!activeJsonlFiles.has(filePath)) {
      removeAgent(agentId, filePath)
    }
  }
}

function createAgent(jsonlFile: string, projectDir: string): void {
  const id = nextAgentId++
  const stat = fs.statSync(jsonlFile)

  const agent: AgentState = {
    id,
    pid: null,
    projectDir,
    jsonlFile,
    fileOffset: 0, // Start from beginning to catch current state
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastActivity: stat.mtimeMs,
  }

  agents.set(id, agent)
  knownJsonlFiles.set(jsonlFile, id)

  const projectName = extractSessionName(jsonlFile, projectDir)

  console.log(`[Scanner] Agent ${id} created: ${path.basename(jsonlFile)} (${projectName})`)
  broadcast({ type: 'agentCreated', id, projectName })

  // Read the file to determine current state
  // Only read last portion to get recent activity
  readNewLines(id, true)
}

function removeAgent(agentId: number, jsonlFile: string): void {
  cancelWaitingTimer(agentId, waitingTimers)
  cancelPermissionTimer(agentId, permissionTimers)

  agents.delete(agentId)
  knownJsonlFiles.delete(jsonlFile)

  console.log(`[Scanner] Agent ${agentId} removed (stale)`)
  broadcast({ type: 'agentClosed', id: agentId })
}

function readNewLines(agentId: number, initialRead = false): void {
  const agent = agents.get(agentId)
  if (!agent) return

  try {
    const stat = fs.statSync(agent.jsonlFile)
    agent.lastActivity = stat.mtimeMs

    // For initial reads, skip to near the end to get recent state
    if (initialRead && stat.size > 50000) {
      agent.fileOffset = Math.max(0, stat.size - 50000)
      // We need to skip a partial first line
    }

    if (stat.size <= agent.fileOffset) return

    const buf = Buffer.alloc(stat.size - agent.fileOffset)
    const fd = fs.openSync(agent.jsonlFile, 'r')
    fs.readSync(fd, buf, 0, buf.length, agent.fileOffset)
    fs.closeSync(fd)
    agent.fileOffset = stat.size

    const text = agent.lineBuffer + buf.toString('utf-8')
    const lines = text.split('\n')
    agent.lineBuffer = lines.pop() || ''

    const hasLines = lines.some(l => l.trim())
    if (hasLines) {
      cancelWaitingTimer(agentId, waitingTimers)
      cancelPermissionTimer(agentId, permissionTimers)
      if (agent.permissionSent) {
        agent.permissionSent = false
        broadcast({ type: 'agentToolPermissionClear', id: agentId })
      }
    }

    for (const line of lines) {
      if (!line.trim()) continue
      processTranscriptLine(agentId, line, agents, waitingTimers, permissionTimers, broadcast)
    }
  } catch {
    // File may have been deleted
  }
}
