import { useMemo, useRef, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, parseEventLogs } from 'viem'
import { Check, Circle } from 'lucide-react'
import {
  AGENTIC_COMMERCE,
  CHAIN_ID,
  OFFICE_ADDRESS,
  USDC_ADDRESS,
  ZERO_ADDRESS,
  commerceAbi,
  officeAbi,
} from '@/lib/chain'
import { parseUsdc } from '@/onchain-money'
import { sameAddr, shortAddr, usdcText } from '@/lib/format'
import { useOffice, type AgentView, type TaskView } from '@/hooks/useOffice'
import { useTx } from '@/hooks/useTx'
import { Field, Sheet, Spinner, UsdcAmount } from '@/components/ui'

type StepKey = 'create' | 'record' | 'budget' | 'approve' | 'fund'

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'create', label: 'Open the escrow job' },
  { key: 'record', label: 'Record the task in the office ledger' },
  { key: 'budget', label: 'Set the agreed budget' },
  { key: 'approve', label: 'Allow USDC for escrow' },
  { key: 'fund', label: 'Fund the escrow' },
]

const EXPIRY: { label: string; seconds: number }[] = [
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
]

const emptyDone = (): Record<StepKey, boolean> => ({ create: false, record: false, budget: false, approve: false, fund: false })

interface Props {
  agent: AgentView | null
  parent: TaskView | null
  onClose: () => void
  onDone: () => void
}

export function HireSheet({ agent, parent, onClose, onDone }: Props) {
  return (
    <Sheet open={agent !== null} onClose={onClose} title={agent ? `Hire ${agent.name}` : 'Hire'}>
      {agent ? <HireForm key={`${agent.id.toString()}-${parent?.id.toString() ?? '0'}`} agent={agent} parent={parent} onDone={onDone} /> : null}
    </Sheet>
  )
}

function HireForm({ agent, parent, onDone }: { agent: AgentView; parent: TaskView | null; onDone: () => void }) {
  const { address } = useAccount()
  const { data } = useOffice()
  const { send, act, busy, publicClient } = useTx()

  const [brief, setBrief] = useState(parent ? `Continues task #${parent.id.toString()}: ` : '')
  const [budget, setBudget] = useState(usdcText(agent.priceUsdc).replace(/,/g, ''))
  const [evaluator, setEvaluator] = useState<string>('me')
  const [expiry, setExpiry] = useState(86400)
  const [done, setDone] = useState<Record<StepKey, boolean>>(emptyDone)
  const [finished, setFinished] = useState<bigint | null>(null)
  const [failedAt, setFailedAt] = useState<StepKey | null>(null)
  const ctx = useRef<{ jobId?: bigint; taskId?: bigint }>({})
  const stepRef = useRef<StepKey>('create')

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const validators = useMemo(
    () => (data?.agents ?? []).filter((a) => a.role.toLowerCase() === 'validator' && a.active && a.id !== agent.id),
    [data, agent.id],
  )

  const budgetRaw = useMemo(() => {
    try {
      const raw = parseUsdc(budget)
      return raw > 0n ? raw : null
    } catch {
      return null
    }
  }, [budget])

  const started = Object.values(done).some(Boolean)
  const insufficient = budgetRaw !== null && balance !== undefined && balance < budgetRaw
  const valid = brief.trim().length >= 10 && budgetRaw !== null && !!address

  const run = async () => {
    if (!address || budgetRaw === null) return
    const evaluatorAddress = evaluator === 'me' ? address : evaluator
    const local = { ...done }
    const ok = await act('hire', 'Task funded and escrowed', async () => {
      try {
        if (!local.create) {
          stepRef.current = 'create'
          const expiredAt = BigInt(Math.floor(Date.now() / 1000) + expiry)
          const receipt = await send({
            address: AGENTIC_COMMERCE,
            abi: commerceAbi,
            functionName: 'createJob',
            args: [agent.wallet, evaluatorAddress, expiredAt, brief.trim().slice(0, 500), ZERO_ADDRESS],
          })
          const [log] = parseEventLogs({ abi: commerceAbi, eventName: 'JobCreated', logs: receipt.logs })
          if (!log) throw new Error('Job created but no job id was emitted.')
          ctx.current.jobId = log.args.jobId
          local.create = true
          setDone({ ...local })
        }
        const jobId = ctx.current.jobId
        if (jobId === undefined) throw new Error('Missing job id.')
        if (!local.record) {
          stepRef.current = 'record'
          const receipt = await send({
            address: OFFICE_ADDRESS,
            abi: officeAbi,
            functionName: 'recordTask',
            args: [jobId, agent.id, parent?.id ?? 0n],
          })
          const [log] = parseEventLogs({ abi: officeAbi, eventName: 'TaskRecorded', logs: receipt.logs })
          ctx.current.taskId = log?.args.taskId
          local.record = true
          setDone({ ...local })
        }
        if (!local.budget) {
          stepRef.current = 'budget'
          await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'setBudget', args: [jobId, budgetRaw, '0x'] })
          local.budget = true
          setDone({ ...local })
        }
        if (!local.approve) {
          stepRef.current = 'approve'
          const allowance = publicClient
            ? await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [address, AGENTIC_COMMERCE] })
            : 0n
          if (allowance < budgetRaw) {
            await send({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [AGENTIC_COMMERCE, budgetRaw] })
          }
          local.approve = true
          setDone({ ...local })
        }
        if (!local.fund) {
          stepRef.current = 'fund'
          await send({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'fund', args: [jobId, '0x'] })
          local.fund = true
          setDone({ ...local })
        }
        setFailedAt(null)
      } catch (error) {
        setFailedAt(stepRef.current)
        throw error
      }
    })
    if (ok) setFinished(ctx.current.taskId ?? 0n)
  }

  return (
        <div className="grid gap-5">
          <div className="inset flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="label">{agent.role}</div>
              <div className="display text-lg font-semibold">{agent.name}</div>
            </div>
            <div className="text-right">
              <div className="label">Payee wallet</div>
              <div className="mono text-xs text-[var(--muted)]">{shortAddr(agent.wallet)}</div>
            </div>
          </div>

          {parent ? (
            <div className="chip chip-ok !w-fit">Handoff from task #{parent.id.toString()}</div>
          ) : null}

          {finished !== null ? (
            <div className="card grid gap-3 p-5">
              <div className="chip chip-ok !w-fit">Escrow funded</div>
              <p className="text-sm text-[var(--muted)] text-pretty">
                {usdcText(budgetRaw ?? 0n)} USDC is locked in escrow for {agent.name}. The agent accepts the task, delivers work, and your evaluator releases payment.
              </p>
              <button type="button" className="btn btn-primary" onClick={onDone}>
                Open the task board
              </button>
            </div>
          ) : (
            <>
              <Field label="Task brief" hint="Stored onchain with the job. Keep it specific and checkable.">
                <textarea
                  className="field min-h-[110px]"
                  value={brief}
                  maxLength={500}
                  disabled={started}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Summarize the ten largest governance proposals from last week, with sources."
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Budget (USDC)" hint={insufficient ? `Your balance is ${usdcText(balance ?? 0n)} USDC.` : 'Released to the agent on approval.'}>
                  <input className="field num" inputMode="decimal" value={budget} disabled={started} onChange={(e) => setBudget(e.target.value)} />
                </Field>
                <Field label="Expires in">
                  <select className="field" value={expiry} disabled={started} onChange={(e) => setExpiry(Number(e.target.value))}>
                    {EXPIRY.map((e) => (
                      <option key={e.seconds} value={e.seconds}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="Who verifies the work"
                hint={evaluator === 'me' ? 'You approve or reject. Rejections cannot lower the agent score when you evaluate your own task.' : 'This wallet alone approves or rejects the delivery.'}
              >
                <select className="field" value={evaluator} disabled={started} onChange={(e) => setEvaluator(e.target.value)}>
                  <option value="me">Me (the client)</option>
                  {validators
                    .filter((v) => !sameAddr(v.wallet, address))
                    .map((v) => (
                      <option key={v.id.toString()} value={v.wallet}>
                        {v.name} · validator {shortAddr(v.wallet)}
                      </option>
                    ))}
                </select>
              </Field>

              {started ? (
                <ol className="grid gap-2" aria-label="Progress">
                  {STEPS.map((s) => {
                    const isDone = done[s.key]
                    const isActive = busy === 'hire' && !isDone && STEPS.find((x) => !done[x.key])?.key === s.key
                    return (
                      <li key={s.key} className="flex items-center gap-2.5 text-sm">
                        {isDone ? <Check size={16} className="text-[var(--success)]" /> : isActive ? <Spinner /> : <Circle size={16} className="text-[var(--subtle)]" />}
                        <span className={isDone ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}>{s.label}</span>
                        {failedAt === s.key ? <span className="chip chip-bad">Needs a retry</span> : null}
                      </li>
                    )
                  })}
                </ol>
              ) : null}

              {failedAt === 'budget' ? (
                <p className="text-xs text-[var(--warn)] text-pretty">
                  The escrow contract rejected the budget from your wallet. The agent can set it instead from its Tasks view, after which you can fund from there.
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <div>
                  <div className="label">You pay on funding</div>
                  <UsdcAmount raw={budgetRaw ?? 0n} />
                </div>
                {address ? (
                  <button type="button" className="btn btn-primary" disabled={!valid || insufficient || busy !== null} onClick={() => void run()}>
                    {busy === 'hire' ? <Spinner /> : null}
                    {busy === 'hire' ? 'Working…' : started ? 'Resume' : 'Fund escrow and hire'}
                  </button>
                ) : (
                  <ConnectKitButton.Custom>
                    {({ show }) => (
                      <button type="button" className="btn btn-primary" onClick={show}>
                        Connect wallet
                      </button>
                    )}
                  </ConnectKitButton.Custom>
                )}
              </div>
            </>
          )}
        </div>
  )
}
