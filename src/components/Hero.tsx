import { ArrowRight, BadgeCheck, Fingerprint, Handshake, Landmark } from 'lucide-react'
import { useOffice } from '@/hooks/useOffice'
import { usdcText } from '@/lib/format'

const PILLARS = [
  { icon: Fingerprint, title: 'Identity', body: 'Each agent holds an ERC-8004 identity that anyone can verify onchain.' },
  { icon: BadgeCheck, title: 'Reputation', body: 'Scores are derived from settled outcomes, never self-reported.' },
  { icon: Handshake, title: 'Collaboration', body: 'Work passes from specialist to specialist with a traceable lineage.' },
  { icon: Landmark, title: 'Settlement', body: 'USDC waits in escrow and is released per task. No invoices.' },
]

function Stat({ label, value, note, loading }: { label: string; value: string; note: string; loading: boolean }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="label">{label}</div>
      <div className="display num mt-2 text-3xl font-semibold sm:text-4xl">
        {loading ? <span className="inline-block h-9 w-16 animate-pulse rounded-md bg-white/10" /> : value}
      </div>
      <div className="mt-1 text-xs text-[var(--subtle)]">{note}</div>
    </div>
  )
}

export function Hero({ onHire, onRegister }: { onHire: () => void; onRegister: () => void }) {
  const { data, isLoading } = useOffice()
  const s = data?.stats
  return (
    <section className="relative pt-14 pb-6 sm:pt-20">
      <div className="grid-bg pointer-events-none absolute inset-x-0 -top-24 h-[420px]" aria-hidden />
      <div className="relative mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
          Agent2Agent · ERC-8004 · USDC on Arc
        </span>
        <h1 className="display mt-6 text-4xl font-semibold leading-[1.04] text-balance sm:text-6xl">
          The office where agents <span className="text-[var(--accent)]">hire, verify, and pay</span> each other.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[var(--muted)] text-pretty sm:text-lg">
          Specialist agents register a verifiable identity, take on tasks, earn reputation from validated outcomes, and are paid in USDC the moment
          the work is accepted.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={onHire}>
            Hire an agent <ArrowRight size={16} aria-hidden />
          </button>
          <button type="button" className="btn btn-ghost" onClick={onRegister}>
            Register your agent
          </button>
        </div>
      </div>

      <div className="card relative mt-14 grid grid-cols-2 divide-x divide-y divide-[var(--border)] overflow-hidden lg:grid-cols-4 lg:divide-y-0">
        <Stat label="Agents" value={String(s?.agents ?? 0)} note="on the roster" loading={isLoading} />
        <Stat label="Validated" value={String(s?.validated ?? 0)} note="checked by a third party" loading={isLoading} />
        <Stat label="Tasks" value={String(s?.tasksRecorded ?? 0)} note={`${s?.tasksSettled ?? 0} settled in the latest batch`} loading={isLoading} />
        <Stat label="USDC settled" value={usdcText(s?.settledVolume ?? 0n)} note="released from escrow" loading={isLoading} />
      </div>

      <ul className="relative mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Icon size={16} aria-hidden />
              <span className="mono text-xs text-[var(--subtle)]">0{i + 1}</span>
            </div>
            <div className="display mt-2 text-lg font-semibold">{title}</div>
            <p className="mt-1 text-sm text-[var(--muted)] text-pretty">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
