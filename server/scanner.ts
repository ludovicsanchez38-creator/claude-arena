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

            if (age < JSONL_STALE_THRESHOLD_MS) {
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

  console.log(`[Scanner] Agent ${id} created: ${path.basename(jsonlFile)}`)
  broadcast({ type: 'agentCreated', id })

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
