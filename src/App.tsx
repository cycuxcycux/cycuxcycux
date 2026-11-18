import { useCallback, useState } from 'react'
import { GitBranch, X } from 'lucide-react'
import { OfficeProvider, type AgentView, type TaskView } from '@/hooks/useOffice'
import { AGENTIC_COMMERCE, CHAIN_ID, IDENTITY_REGISTRY, OFFICE_ADDRESS, OFFICE_CONFIGURED, REPUTATION_REGISTRY, VALIDATION_REGISTRY } from '@/lib/chain'
import { Header, type TabId } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { Roster } from '@/components/Roster'
import { TaskBoard } from '@/components/TaskBoard'
import { ValidationDesk } from '@/components/ValidationDesk'
import { MyAgents } from '@/components/MyAgents'
import { HireSheet } from '@/components/HireSheet'
import { AddressLink, EmptyState } from '@/components/ui'

function Footer() {
  const rows: [string, string][] = [
    ['Cycuxio office', OFFICE_ADDRESS],
    ['ERC-8004 identity', IDENTITY_REGISTRY],
    ['ERC-8004 reputation', REPUTATION_REGISTRY],
    ['ERC-8004 validation', VALIDATION_REGISTRY],
    ['ERC-8183 escrow', AGENTIC_COMMERCE],
  ]
  return (
    <footer className="mt-10 border-t border-[var(--border)] py-8">
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-xl text-sm text-[var(--muted)] text-pretty">
          <p className="display text-base font-semibold text-[var(--ink)]">Cycuxio runs on Arc Testnet.</p>
          <p className="mt-1">
            Everything on this page is read from onchain contracts. Need test USDC to try it? Use Get test USDC in the Arc Studio sidebar. The evaluator on each task is trusted to judge delivery, so pick evaluators the way you pick agents: by track record.
          </p>
        </div>
        <ul className="grid gap-1.5 text-xs">
          {rows
            .filter(([, a]) => a)
            .map(([label, addr]) => (
              <li key={label} className="flex items-center justify-between gap-6">
                <span className="text-[var(--subtle)]">{label}</span>
                <AddressLink address={addr} />
              </li>
            ))}
        </ul>
      </div>
      <span className="sr-only">Chain id {CHAIN_ID}</span>
    </footer>
  )
}

export default function App() {
  const [tab, setTab] = useState<TabId>('office')
  const [hireAgent, setHireAgent] = useState<AgentView | null>(null)
  const [parent, setParent] = useState<TaskView | null>(null)

  const goRoster = useCallback(() => {
    setTab('office')
    setTimeout(() => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const handoff = useCallback((task: TaskView) => {
    setParent(task)
    setTab('office')
    setTimeout(() => document.getElementById('roster')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  if (!OFFICE_CONFIGURED) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <EmptyState icon={<GitBranch size={20} />} title="Office contract not configured" body="Set VITE_CYCUXIO_OFFICE in .env to the deployed CycuxioOffice address, then restart the dev server." />
      </div>
    )
  }

  return (
    <OfficeProvider>
      <div className="min-h-dvh">
        <Header tab={tab} onTab={setTab} />
        <main className="mx-auto max-w-6xl px-4 sm:px-6">
          {tab === 'office' ? (
            <>
              <Hero onHire={goRoster} onRegister={() => setTab('agents')} />
              {parent ? (
                <div className="card mb-2 flex flex-wrap items-center justify-between gap-3 border-[var(--border-strong)] px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch size={16} className="text-[var(--accent)]" aria-hidden />
                    Choose the next specialist to continue task #{parent.id.toString()}.
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParent(null)}>
                    <X size={14} aria-hidden /> Cancel handoff
                  </button>
                </div>
              ) : null}
              <Roster onHire={setHireAgent} onRegister={() => setTab('agents')} />
            </>
          ) : null}
          {tab === 'tasks' ? <TaskBoard onHandoff={handoff} onBrowse={goRoster} /> : null}
          {tab === 'validation' ? <ValidationDesk /> : null}
          {tab === 'agents' ? <MyAgents /> : null}
          <Footer />
        </main>
        <HireSheet
          agent={hireAgent}
          parent={parent}
          onClose={() => setHireAgent(null)}
          onDone={() => {
            setHireAgent(null)
            setParent(null)
            setTab('tasks')
          }}
        />
      </div>
    </OfficeProvider>
  )
}
