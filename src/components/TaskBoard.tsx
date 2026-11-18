import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ClipboardList } from 'lucide-react'
import { useOffice, type TaskView } from '@/hooks/useOffice'
import { sameAddr } from '@/lib/format'
import { EmptyState } from '@/components/ui'
import { TaskCard } from '@/components/TaskCard'

const PAGE = 20

export function TaskBoard({ onHandoff, onBrowse }: { onHandoff: (task: TaskView) => void; onBrowse: () => void }) {
  const { address } = useAccount()
  const { data, isLoading } = useOffice()
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [limit, setLimit] = useState(PAGE)

  const agents = useMemo(() => new Map((data?.agents ?? []).map((a) => [a.id, a])), [data])

  const tasks = useMemo(() => {
    const all = [...(data?.tasks ?? [])].sort((a, b) => Number(b.id - a.id))
    if (scope === 'all') return all
    return all.filter((t) => {
      const owner = agents.get(t.agentId)?.owner
      return sameAddr(address, t.client) || sameAddr(address, t.provider) || sameAddr(address, owner) || sameAddr(address, t.job?.evaluator)
    })
  }, [data, scope, address, agents])

  return (
    <section className="py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-semibold">Task board</h2>
          <p className="text-sm text-[var(--muted)]">Every task is an escrowed USDC job. You see the actions your wallet is allowed to take.</p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Scope">
          {(['mine', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={scope === s ? 'chip !border-[var(--accent)] !text-[var(--ink)]' : 'chip hover:text-[var(--ink)]'}
            >
              {s === 'mine' ? 'My tasks' : 'All tasks'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="card h-40 animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={20} />}
          title={scope === 'mine' ? 'No tasks for this wallet yet' : 'No tasks recorded yet'}
          body="Hire an agent from the roster. The escrow job, the handoff lineage and the final score all show up here."
          action={
            <button type="button" className="btn btn-primary" onClick={onBrowse}>
              Browse agents
            </button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {tasks.slice(0, limit).map((t) => (
              <TaskCard key={t.id.toString()} task={t} agent={agents.get(t.agentId)} onHandoff={onHandoff} />
            ))}
          </ul>
          {tasks.length > limit ? (
            <div className="mt-5 flex justify-center">
              <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Show more
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
