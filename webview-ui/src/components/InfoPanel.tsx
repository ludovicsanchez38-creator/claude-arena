import { useState, useCallback } from 'react'
import type { ClaudeMeta } from '../hooks/useExtensionMessages.js'
import type { ToolActivity } from '../office/types.js'

interface InfoPanelProps {
  isOpen: boolean
  onClose: () => void
  claudeMeta: ClaudeMeta | null
  sessions: number[]
  sessionStatuses: Record<number, string>
  sessionTools: Record<number, ToolActivity[]>
  sessionNames: Record<number, string>
}

type TabId = 'sessions' | 'skills' | 'commands' | 'agents' | 'services' | 'crons' | 'hooks'

const PANEL_WIDTH = 520

const tabDefs: Array<{ id: TabId; label: string; icon: string; color: string }> = [
  { id: 'sessions', label: 'Live', icon: '\u25B6', color: '#00FF88' },       // play
  { id: 'skills', label: 'Skills', icon: '\u2605', color: '#22D3EE' },      // star
  { id: 'commands', label: 'Cmds', icon: '\u2318', color: '#E11D8D' },      // command
  { id: 'agents', label: 'Bots', icon: '\u25CF', color: '#A78BFA' },        // purple dot
  { id: 'services', label: 'Svc', icon: '\u26A1', color: '#FF8800' },       // lightning
  { id: 'crons', label: 'Crons', icon: '\u23F0', color: '#FFD700' },        // clock
  { id: 'hooks', label: 'Hooks', icon: '\u2699', color: '#2451FF' },        // gear
]

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {})
}

const statusColors: Record<string, string> = {
  active: '#00FF88',
  inactive: '#FF4444',
  unknown: '#888',
}

function InfoPanel({ isOpen, onClose, claudeMeta, sessions, sessionStatuses, sessionTools, sessionNames }: InfoPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sessions')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = useCallback((id: string, text: string) => {
    copyToClipboard(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500)
  }, [])

  if (!isOpen) return null

  const skills = claudeMeta?.skills ?? []
  const commands = claudeMeta?.commands ?? []
  const hooks = claudeMeta?.hooks ?? []
  const infra = claudeMeta?.infrastructure ?? { agents: [], services: [], crons: [] }
  const totalHooks = hooks.reduce((n, p) => n + p.hooks.length, 0)

  function getCount(id: TabId): number {
    switch (id) {
      case 'sessions': return sessions.length
      case 'agents': return infra.agents.length
      case 'services': return infra.services.length
      case 'crons': return infra.crons.length
      case 'skills': return skills.length
      case 'commands': return commands.length
      case 'hooks': return totalHooks
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          zIndex: 48,
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: PANEL_WIDTH,
          height: '100%',
          zIndex: 50,
          background: 'var(--pixel-bg, #1a1a2e)',
          borderLeft: '2px solid var(--pixel-border, #333)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '32px', color: '#E6EDF7', fontWeight: 600, letterSpacing: '1px' }}>
            SYNOPTIA INFRA
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '36px',
              cursor: 'pointer',
              padding: '0 8px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>

        {/* Tabs - row 1: 4 tabs, row 2: 3 tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0,
          }}
        >
          {tabDefs.map((tab) => {
            const isActive = activeTab === tab.id
            const count = getCount(tab.id)
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 4px',
                  fontSize: '22px',
                  background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                  color: isActive ? tab.color : 'rgba(255, 255, 255, 0.45)',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: '18px' }}>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '18px',
                    background: isActive ? tab.color : 'rgba(255, 255, 255, 0.12)',
                    color: isActive ? '#0B1226' : 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '8px',
                    padding: '1px 6px',
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Sessions - Claude Code live */}
          {activeTab === 'sessions' &&
            sessions.map((id) => {
              const status = sessionStatuses[id] ?? 'active'
              const tools = sessionTools[id] ?? []
              const activeTools = tools.filter((t) => !t.done)
              const statusColor = status === 'waiting' ? '#FFD700' : '#00FF88'
              const statusLabel = status === 'waiting' ? 'En attente' : 'Actif'
              const toolSummary = activeTools.length > 0
                ? activeTools.map((t) => t.status).join(', ')
                : status === 'waiting' ? 'En attente d\'input' : 'Idle'
              const name = sessionNames[id] ?? `Session #${id}`
              return (
                <SessionCard
                  key={id}
                  name={name}
                  statusColor={statusColor}
                  statusLabel={statusLabel}
                  toolSummary={toolSummary}
                  activeTools={activeTools}
                  doneCount={tools.filter((t) => t.done).length}
                />
              )
            })}
          {activeTab === 'sessions' && sessions.length === 0 && <EmptyState text="Aucune session Claude Code active" />}

          {/* Agents */}
          {activeTab === 'agents' &&
            infra.agents.map((agent) => (
              <Card
                key={agent.name}
                id={`agent-${agent.name}`}
                icon={'\u25CF'}
                badgeColor={statusColors[agent.status] ?? statusColors.unknown}
                name={agent.name}
                description={`${agent.host} (${agent.ip}) ${agent.model ? '- ' + agent.model : ''}`}
                subtitle={agent.channels.join(', ')}
                copyText={`ssh ${agent.ip}`}
                onCopy={handleCopy}
                isCopied={copiedId === `agent-${agent.name}`}
              />
            ))}
          {activeTab === 'agents' && infra.agents.length === 0 && <EmptyState text="Aucun agent configure" />}

          {/* Services */}
          {activeTab === 'services' &&
            infra.services.map((svc, i) => (
              <Card
                key={`${svc.host}-${svc.name}-${i}`}
                id={`svc-${svc.host}-${svc.name}-${i}`}
                icon={svc.type === 'docker' ? '\u{1F4E6}' : '\u26A1'}
                badgeColor={svc.type === 'docker' ? '#2496ED' : '#FF8800'}
                name={`${svc.name}`}
                description={svc.description}
                subtitle={`${svc.host} (${svc.ip}) - ${svc.type}`}
                copyText={svc.type === 'systemd' ? `systemctl status ${svc.name}` : `docker ps | grep ${svc.name}`}
                onCopy={handleCopy}
                isCopied={copiedId === `svc-${svc.host}-${svc.name}-${i}`}
              />
            ))}
          {activeTab === 'services' && infra.services.length === 0 && <EmptyState text="Aucun service configure" />}

          {/* Crons */}
          {activeTab === 'crons' &&
            infra.crons.map((cron, i) => (
              <Card
                key={`cron-${i}`}
                id={`cron-${i}`}
                icon={'\u23F0'}
                badgeColor="#FFD700"
                name={cron.command}
                description={cron.description}
                subtitle={`${cron.host} - ${cron.schedule}`}
                copyText={`${cron.schedule} ${cron.command}`}
                onCopy={handleCopy}
                isCopied={copiedId === `cron-${i}`}
              />
            ))}
          {activeTab === 'crons' && infra.crons.length === 0 && <EmptyState text="Aucun cron configure" />}

          {/* Skills */}
          {activeTab === 'skills' &&
            skills.map((skill) => (
              <Card
                key={skill.name}
                id={`skill-${skill.name}`}
                icon={'\u2605'}
                badgeColor="#22D3EE"
                name={skill.name}
                description={skill.description}
                copyText={skill.name}
                onCopy={handleCopy}
                isCopied={copiedId === `skill-${skill.name}`}
              />
            ))}
          {activeTab === 'skills' && skills.length === 0 && <EmptyState text="Aucun skill" />}

          {/* Commands */}
          {activeTab === 'commands' &&
            commands.map((cmd) => (
              <Card
                key={cmd.name}
                id={`cmd-${cmd.name}`}
                icon={'\u2318'}
                badgeColor="#E11D8D"
                name={`/${cmd.name}`}
                description={cmd.description}
                copyText={`/${cmd.name}`}
                onCopy={handleCopy}
                isCopied={copiedId === `cmd-${cmd.name}`}
              />
            ))}
          {activeTab === 'commands' && commands.length === 0 && <EmptyState text="Aucune commande" />}

          {/* Hooks */}
          {activeTab === 'hooks' &&
            hooks.map((plugin) =>
              plugin.hooks.map((hook, i) => (
                <Card
                  key={`${plugin.pluginName}-${i}`}
                  id={`hook-${plugin.pluginName}-${i}`}
                  icon={'\u2699'}
                  badgeColor="#2451FF"
                  name={hook.event}
                  description={`${plugin.pluginName} - ${hook.matcher}${hook.async ? ' (async)' : ''}`}
                  copyText={hook.command}
                  onCopy={handleCopy}
                  isCopied={copiedId === `hook-${plugin.pluginName}-${i}`}
                />
              )),
            )}
          {activeTab === 'hooks' && totalHooks === 0 && <EmptyState text="Aucun hook" />}
        </div>
      </div>
    </>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center', padding: '24px 0', fontSize: '30px' }}>
      {text}
    </div>
  )
}

interface CardProps {
  id: string
  icon: string
  badgeColor: string
  name: string
  description: string
  subtitle?: string
  copyText: string
  onCopy: (id: string, text: string) => void
  isCopied: boolean
}

function Card({ id, icon, badgeColor, name, description, subtitle, copyText, onCopy, isCopied }: CardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${hovered ? badgeColor + '40' : 'rgba(255, 255, 255, 0.06)'}`,
        borderRadius: '6px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        transition: 'all 0.15s ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Badge */}
      <span
        style={{
          background: badgeColor,
          color: '#0B1226',
          borderRadius: '3px',
          padding: '4px 8px',
          fontSize: '20px',
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {icon}
      </span>
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          title={name}
          style={{
            fontSize: '28px',
            fontWeight: 600,
            color: '#E6EDF7',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        {description && (
          <div
            title={description}
            style={{
              fontSize: '22px',
              color: '#A9B8D8',
              marginTop: 4,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {description}
          </div>
        )}
        {subtitle && (
          <div
            style={{
              fontSize: '18px',
              color: 'rgba(255, 255, 255, 0.35)',
              marginTop: 4,
              fontStyle: 'italic',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {/* Copy button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onCopy(id, copyText)
        }}
        style={{
          background: isCopied ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
          border: 'none',
          color: isCopied ? '#22D3EE' : 'rgba(255, 255, 255, 0.3)',
          fontSize: '28px',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: '3px',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        title={`Copy: ${copyText}`}
      >
        {isCopied ? '\u2713' : '\u2398'}
      </button>
    </div>
  )
}

function SessionCard({ name, statusColor, statusLabel, toolSummary, activeTools, doneCount }: {
  name: string
  statusColor: string
  statusLabel: string
  toolSummary: string
  activeTools: ToolActivity[]
  doneCount: number
}) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${statusColor}30`,
        borderRadius: '4px',
        padding: '16px 18px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            flexShrink: 0,
          }}
        />
        <span translate="no" style={{ fontSize: '28px', fontWeight: 600, color: '#E6EDF7' }}>
          {name}
        </span>
        <span
          style={{
            fontSize: '20px',
            background: `${statusColor}25`,
            color: statusColor,
            padding: '1px 6px',
            borderRadius: '4px',
            fontWeight: 600,
            marginLeft: 'auto',
          }}
        >
          {statusLabel}
        </span>
      </div>
      {/* Tool summary */}
      <div style={{ fontSize: '22px', color: '#A9B8D8', lineHeight: 1.4 }}>
        {toolSummary}
      </div>
      {/* Active tools dots */}
      {(activeTools.length > 0 || doneCount > 0) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeTools.map((t) => (
            <span
              key={t.toolId}
              className="pixel-agents-pulse"
              title={t.status}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: t.permissionWait ? '#FFD700' : '#3794ff',
                display: 'inline-block',
              }}
            />
          ))}
          {doneCount > 0 && (
            <span style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.35)', marginLeft: 4 }}>
              +{doneCount} done
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export { InfoPanel }
