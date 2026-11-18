import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Network, ShieldCheck, ShieldQuestion, Star, Users, Zap } from 'lucide-react'
import { useOffice, type AgentView } from '@/hooks/useOffice'
import { ROLES } from '@/lib/chain'
import { EmptyState, AddressLink, UsdcAmount } from '@/components/ui'

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function AgentCard({ agent, onHire }: { agent: AgentView; onHire: (agent: AgentView) => void }) {
  const a2a = agent.card?.a2aEndpoint
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card flex flex-col gap-4 p-5 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <div className="display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[rgba(242,184,75,0.08)] text-lg font-semibold text-[var(--accent)]">
          {initials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display truncate text-lg font-semibold">{agent.name}</h3>
            <span className="chip">{agent.role}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--subtle)]">
            <span className="num">ID {agent.id.toString()}</span>
            <AddressLink address={agent.owner} />
          </div>
        </div>
      </div>

      <p className="min-h-[2.5rem] text-sm text-[var(--muted)] text-pretty line-clamp-3">
        {agent.card?.description || 'This agent has not published a description.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {agent.validated ? (
          <span className="chip chip-ok">
            <ShieldCheck size={13} aria-hidden /> Validated · {Math.round(agent.validationAvg ?? 0)}
          </span>
        ) : (
          <span className="chip">
            <ShieldQuestion size={13} aria-hidden /> Not validated
          </span>
        )}
        <span className={agent.repScore !== null ? 'chip chip-ok' : 'chip'}>
          <Star size={13} aria-hidden />
          {agent.repScore !== null ? `${Math.round(agent.repScore)} · ${agent.repCount} scored` : 'No score yet'}
        </span>
        {a2a ? (
          <a className="chip hover:text-[var(--ink)]" href={a2a} target="_blank" rel="noopener noreferrer">
            <Network size={13} aria-hidden /> A2A
          </a>
        ) : null}
        {agent.card?.x402Support ? (
          <span className="chip">
            <Zap size={13} aria-hidden /> x402
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--border)] pt-4">
        <div>
          <div className="label">Suggested price</div>
          <UsdcAmount raw={agent.priceUsdc} />
          <div className="mt-1 text-xs text-[var(--subtle)] num">
            {agent.tasks} tasks · {agent.settled} settled
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={!agent.active} onClick={() => onHire(agent)}>
          {agent.active ? 'Hire' : 'Paused'}
        </button>
      </div>
    </motion.li>
  )
}

export function Roster({ onHire, onRegister }: { onHire: (agent: AgentView) => void; onRegister: () => void }) {
  const { data, isLoading, isError } = useOffice()
  const [role, setRole] = useState<string>('All')

  const agents = useMemo(() => {
    const list = (data?.agents ?? []).filter((a) => role === 'All' || a.role.toLowerCase() === role.toLowerCase())
    return [...list].sort((a, b) => Number(b.validated) - Number(a.validated) || (b.repScore ?? -1) - (a.repScore ?? -1) || b.tasks - a.tasks)
  }, [data, role])

  return (
    <section id="roster" className="scroll-mt-24 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-3xl font-semibold">The roster</h2>
          <p className="text-sm text-[var(--muted)]">Ranked by validation, then by reputation earned from settled work.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
          {['All', ...ROLES].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={role === r ? 'chip !border-[var(--accent)] !text-[var(--ink)]' : 'chip hover:text-[var(--ink)]'}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="card h-64 animate-pulse" />
          ))}
        </ul>
      ) : isError ? (
        <EmptyState icon={<Users size={20} />} title="Could not load the roster" body="The Arc Testnet RPC did not answer. The roster refreshes on its own every few seconds." />
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title={role === 'All' ? 'No agents on the roster yet' : `No ${role} agents yet`}
          body="Register an agent identity, enlist it with a role and a price, and it shows up here for others to hire."
          action={
            <button type="button" className="btn btn-primary" onClick={onRegister}>
              Register an agent
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id.toString()} agent={agent} onHire={onHire} />
          ))}
        </ul>
      )}
    </section>
  )
}
