import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import type { PluginHooks, HookDefinition, CommandDefinition, SkillDefinition, Infrastructure, InfraAgent, InfraService, InfraCron } from './types.js'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const ARENA_DIR = path.join(os.homedir(), '.claude-arena')
const INFRA_FILE = path.join(ARENA_DIR, 'infrastructure.json')
const RESCAN_INTERVAL_MS = 30_000

let cachedHooks: PluginHooks[] = []
let cachedCommands: CommandDefinition[] = []
let cachedSkills: SkillDefinition[] = []
let cachedInfra: Infrastructure = { agents: [], services: [], crons: [] }

/** Parse YAML-like frontmatter between --- delimiters */
function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return result

  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

/** Extract name and description from a skill SKILL.md (frontmatter or heading) */
function parseSkillFile(filePath: string, dirName: string): SkillDefinition | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const fm = parseFrontmatter(content)

    const name = fm.name || dirName
    let description = fm.description || ''

    // If no description from frontmatter, try to get it from the first non-empty line after the title
    if (!description) {
      const lines = content.split('\n')
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i].trim()
        if (line.startsWith('#')) {
          // Use heading as fallback description if it's descriptive
          description = line.replace(/^#+\s*/, '')
          break
        }
      }
    }

    return { name, description }
  } catch {
    return null
  }
}

/** Scan skills directory for SKILL.md files */
function scanSkills(): SkillDefinition[] {
  const skillsDir = path.join(CLAUDE_DIR, 'skills')
  if (!fs.existsSync(skillsDir)) return []

  const results: SkillDefinition[] = []
  try {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of dirs) {
      const skillFile = path.join(skillsDir, dir.name, 'SKILL.md')
      if (!fs.existsSync(skillFile)) continue
      const skill = parseSkillFile(skillFile, dir.name)
      if (skill) results.push(skill)
    }

    // Also check for standalone .md files in skills/ (like nanobanana-pro.md)
    const files = fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    for (const file of files) {
      const filePath = path.join(skillsDir, file)
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        const name = file.replace(/\.md$/, '')
        const skill = parseSkillFile(filePath, name)
        if (skill) results.push(skill)
      }
    }
  } catch {
    // Skills dir not readable
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

/** Scan ~/.claude/commands/*.md */
function scanCommands(): CommandDefinition[] {
  const commandsDir = path.join(CLAUDE_DIR, 'commands')
  if (!fs.existsSync(commandsDir)) return []

  const results: CommandDefinition[] = []
  try {
    const files = fs.readdirSync(commandsDir)
      .filter(f => f.endsWith('.md'))

    for (const file of files) {
      const filePath = path.join(commandsDir, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const fm = parseFrontmatter(content)
        const name = file.replace(/\.md$/, '')
        const description = fm.description || ''
        results.push({ name, description })
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Commands dir not readable
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

/** Scan plugins cache for hooks.json files */
function scanHooks(): PluginHooks[] {
  const pluginsCache = path.join(CLAUDE_DIR, 'plugins', 'cache')
  if (!fs.existsSync(pluginsCache)) return []

  const results: PluginHooks[] = []

  function walkDir(dir: string, depth: number): void {
    if (depth > 5) return // Prevent infinite recursion
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walkDir(fullPath, depth + 1)
        } else if (entry.name === 'hooks.json') {
          try {
            const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
            const hooks: HookDefinition[] = []
            const hooksMap = raw.hooks || {}

            for (const [event, matchers] of Object.entries(hooksMap)) {
              if (!Array.isArray(matchers)) continue
              for (const matcher of matchers) {
                const matcherStr = (matcher as { matcher?: string }).matcher || '*'
                const hookList = (matcher as { hooks?: Array<{ type?: string; command?: string; async?: boolean }> }).hooks || []
                for (const h of hookList) {
                  hooks.push({
                    event,
                    matcher: matcherStr,
                    command: h.command || '',
                    async: h.async ?? false,
                  })
                }
              }
            }

            if (hooks.length > 0) {
              // Extract plugin name from path: cache/<org>/<plugin>/<version>/hooks/hooks.json
              const relative = path.relative(pluginsCache, fullPath)
              const parts = relative.split(path.sep)
              const pluginName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]
              results.push({ pluginName, hooks })
            }
          } catch {
            // Invalid hooks.json
          }
        }
      }
    } catch {
      // Dir not readable
    }
  }

  walkDir(pluginsCache, 0)
  return results.sort((a, b) => a.pluginName.localeCompare(b.pluginName))
}

/** Read infrastructure config from ~/.claude-arena/infrastructure.json */
function scanInfrastructure(): Infrastructure {
  const result: Infrastructure = { agents: [], services: [], crons: [] }

  // Read configured infrastructure
  if (fs.existsSync(INFRA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(INFRA_FILE, 'utf-8'))
      if (Array.isArray(raw.agents)) {
        result.agents = raw.agents as InfraAgent[]
      }
      if (Array.isArray(raw.services)) {
        result.services = raw.services as InfraService[]
      }
      if (Array.isArray(raw.crons)) {
        result.crons = raw.crons as InfraCron[]
      }
    } catch {
      // Invalid JSON
    }
  }

  // Add local crontab entries
  try {
    const crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    for (const line of crontab.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      // Parse: "schedule command" (5 fields + command)
      const parts = trimmed.split(/\s+/)
      if (parts.length >= 6) {
        const schedule = parts.slice(0, 5).join(' ')
        const command = parts.slice(5).join(' ')
        result.crons.push({
          schedule,
          command: path.basename(command),
          host: 'Local (MacBook)',
          description: command,
        })
      }
    }
  } catch {
    // No crontab or error
  }

  return result
}

/** Run a full scan and cache results */
function runScan(): void {
  cachedHooks = scanHooks()
  cachedCommands = scanCommands()
  cachedSkills = scanSkills()
  cachedInfra = scanInfrastructure()
  console.log(`[MetaScanner] Found ${cachedHooks.reduce((n, p) => n + p.hooks.length, 0)} hooks, ${cachedCommands.length} commands, ${cachedSkills.length} skills, ${cachedInfra.agents.length} agents, ${cachedInfra.services.length} services, ${cachedInfra.crons.length} crons`)
}

/** Get cached scan results */
export function getClaudeMeta(): { hooks: PluginHooks[]; commands: CommandDefinition[]; skills: SkillDefinition[]; infrastructure: Infrastructure } {
  return { hooks: cachedHooks, commands: cachedCommands, skills: cachedSkills, infrastructure: cachedInfra }
}

/** Start the meta scanner: initial scan + periodic rescan */
export function startMetaScanner(): void {
  runScan()
  setInterval(runScan, RESCAN_INTERVAL_MS)
}
