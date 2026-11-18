import { useState } from 'react'
import { useAccount } from 'wagmi'
import { erc20Abi, keccak256, toBytes } from 'viem'
import { ArrowRight, Clock, GitBranch } from 'lucide-react'
import { AGENTIC_COMMERCE, OFFICE_ADDRESS, USDC_ADDRESS, commerceAbi, officeAbi } from '@/lib/chain'
import { parseUsdc } from '@/onchain-money'
import { isPast, sameAddr, timeLeft } from '@/lib/format'
import type { AgentView, TaskView } from '@/hooks/useOffice'
import { useTx } from '@/hooks/useTx'
import { AddressLink, Field, Spinner, StatusChip, UsdcAmount } from '@/components/ui'

const FINAL = ['Completed', 'Rejected', 'Expired']

function RoleTags({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => (
        <span key={l} className="chip chip-ok">
          You: {l}
        </span>
      ))}
    </div>
  )
}

export function TaskCard({ task, agent, onHandoff }: { task: TaskView; agent: AgentView | undefined; onHandoff: (task: TaskView) => void }) {
  const { address } = useAccount()
  const { send, act, busy, publicClient } = useTx()
  const [note, setNote] = useState('')
  const [deliverable, setDeliverable] = useState('')
  const [budgetInput, setBudgetInput] = useState('')

  const job = task.job
  if (!job) return null

  const isClient = sameAddr(address, job.client)
  const isProvider = sameAddr(address, job.provider)
  const isOwner = !!agent && sameAddr(address, agent.owner)
  const isEvaluator = sameAddr(address, job.evaluator)
  const tags = [isClient && 'client', (isProvider || isOwner) && 'agent', isEvaluator && 'evaluator'].filter(Boolean) as string[]

  const pastExpiry = isPast(job.expiredAt)
  const final = FINAL.includes(job.status)
  const key = (name: string) => `${name}-${task.id.toString()}`
  const jobId = job.id

  const accept = () =>
    act(key('accept'), 'Task accepted', async () => {
      await send({ address: OFFICE_ADDRESS, abi: officeAbi, functionName: 'acceptTask', args: [task.id] })
    })

  const setBudget = () =>
    act(key('budget'), 'Budget set', async () => {
      await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'setBudget', args: [jobId, parseUsdc(budgetInput), '0x'] })
    })

  const fund = () =>
    act(key('fund'), 'Escrow funded', async () => {
      if (!address || !publicClient) throw new Error('Connect your wallet first.')
      const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [address, AGENTIC_COMMERCE] })
      if (allowance < job.budget) await send({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [AGENTIC_COMMERCE, job.budget] })
      await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'fund', args: [jobId, '0x'] })
    })

  const submit = () =>
    act(key('submit'), 'Work delivered', async () => {
      await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'submit', args: [jobId, keccak256(toBytes(deliverable.trim())), '0x'] })
    })

  const decide = (kind: 'complete' | 'reject') =>
    act(key(kind), kind === 'complete' ? 'Payment released to the agent' : 'Task rejected and USDC refunded', async () => {
      const reason = keccak256(toBytes(note.trim() || (kind === 'complete' ? 'accepted' : 'rejected')))
      await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: kind, args: [jobId, reason, '0x'] })
    })

  const refund = () =>
    act(key('refund'), 'Escrow refunded to the client', async () => {
      await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'claimRefund', args: [jobId] })
    })

  const rate = () =>
    act(key('rate'), 'Reputation recorded onchain', async () => {
      await send({ address: OFFICE_ADDRESS, abi: officeAbi, functionName: 'rateTask', args: [task.id] })
    })

  const negative = job.status === 'Rejected' || job.status === 'Expired'
  const rateBlock = negative && sameAddr(job.client, job.evaluator) ? 'Self-evaluated tasks cannot lower an agent score.' : negative && !task.accepted ? 'The agent never accepted this task, so it cannot count against it.' : null
  const canRate = final && !task.rated && (isClient || isEvaluator)
  const disabled = busy !== null

  const btn = (id: string, label: string, onClick: () => Promise<boolean>, variant = 'btn-primary', off = false) => (
    <button type="button" className={`btn btn-sm ${variant}`} disabled={disabled || off} onClick={() => void onClick()}>
      {busy === key(id) ? <Spinner /> : null}
      {label}
    </button>
  )

  return (
    <li className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="display text-lg font-semibold num">Task #{task.id.toString()}</span>
            <StatusChip status={job.status} />
            {task.accepted ? <span className="chip chip-ok">Accepted</span> : <span className="chip">Awaiting agent</span>}
            {task.rated ? <span className="chip chip-ok">Scored</span> : null}
          </div>
          <div className="mt-1 text-sm text-[var(--muted)]">
            {agent?.name ?? `Agent #${task.agentId.toString()}`} · {agent?.role ?? 'Agent'}
          </div>
        </div>
        <div className="text-right">
          <UsdcAmount raw={job.budget} />
          {!final ? (
            <div className="mt-1 flex items-center justify-end gap-1 text-xs text-[var(--subtle)]">
              <Clock size={12} aria-hidden /> {timeLeft(job.expiredAt)}
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-[var(--ink-2)] text-pretty">{job.description || 'No brief provided.'}</p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--subtle)]">
        <span className="flex items-center gap-1.5">
          Client <AddressLink address={job.client} />
        </span>
        <span className="flex items-center gap-1.5">
          Evaluator <AddressLink address={job.evaluator} />
        </span>
        {task.parentTaskId > 0n ? (
          <span className="flex items-center gap-1 text-[var(--accent)]">
            <GitBranch size={12} aria-hidden /> Handoff from #{task.parentTaskId.toString()}
          </span>
        ) : null}
      </div>

      <RoleTags labels={tags} />

      {(isProvider || isOwner || isClient || isEvaluator) && !final ? (
        <div className="grid gap-3 border-t border-[var(--border)] pt-4">
          {(isProvider || isOwner) && !task.accepted ? <div className="flex gap-2">{btn('accept', 'Accept task', accept)}</div> : null}

          {job.status === 'Open' && job.budget === 0n && (isClient || isProvider) ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <Field label="Budget (USDC)">
                  <input className="field num" inputMode="decimal" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="0.50" />
                </Field>
              </div>
              {btn('budget', 'Set budget', setBudget, 'btn-ghost', !budgetInput)}
            </div>
          ) : null}

          {job.status === 'Open' && isClient ? (
            <div className="flex flex-wrap gap-2">
              {btn('fund', 'Fund escrow', fund, 'btn-primary', job.budget === 0n)}
              {btn('reject', 'Cancel task', () => decide('reject'), 'btn-danger')}
            </div>
          ) : null}

          {job.status === 'Funded' && (isProvider || isOwner) ? (
            <div className="grid gap-2">
              <Field label="Deliverable" hint="A link or summary. Its hash is committed onchain; share the full output with the evaluator over A2A.">
                <textarea className="field min-h-[72px]" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="https://… or a short summary of the work" />
              </Field>
              <div>{btn('submit', 'Deliver work', submit, 'btn-primary', !isProvider || deliverable.trim().length < 3)}</div>
              {!isProvider ? <p className="text-xs text-[var(--subtle)]">Delivery must be sent from the agent wallet.</p> : null}
            </div>
          ) : null}

          {isEvaluator && (job.status === 'Submitted' || job.status === 'Funded') ? (
            <div className="grid gap-2">
              <Field label="Evaluation note" hint="Hashed onchain as the reason for your decision.">
                <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Meets the brief, sources check out" />
              </Field>
              <div className="flex flex-wrap gap-2">
                {job.status === 'Submitted' ? btn('complete', 'Approve and pay', () => decide('complete')) : null}
                {btn('reject', 'Reject and refund', () => decide('reject'), 'btn-danger')}
              </div>
            </div>
          ) : null}

          {pastExpiry && (job.status === 'Funded' || job.status === 'Submitted') ? <div>{btn('refund', 'Claim refund', refund, 'btn-ghost')}</div> : null}
        </div>
      ) : null}

      {canRate ? (
        <div className="grid gap-2 border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--muted)] text-pretty">
            {negative ? 'Records a score of 0' : 'Records a score of 100'} for {agent?.name ?? 'this agent'} in the ERC-8004 reputation registry. The score comes from the outcome, not from you.
          </p>
          <div>{btn('rate', 'Record reputation', rate, 'btn-ghost', !!rateBlock)}</div>
          {rateBlock ? <p className="text-xs text-[var(--warn)]">{rateBlock}</p> : null}
        </div>
      ) : null}

      {job.status === 'Completed' && isClient ? (
        <div className="flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHandoff(task)}>
            Hand off to the next agent <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      ) : null}
    </li>
  )
}
