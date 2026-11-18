import { useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { parseEventLogs } from 'viem'
import { Bot, PauseCircle, PlayCircle } from 'lucide-react'
import { OFFICE_ADDRESS, IDENTITY_REGISTRY, ROLES, identityAbi, officeAbi } from '@/lib/chain'
import { encodeCard } from '@/lib/agentCard'
import { sameAddr } from '@/lib/format'
import { parseUsdc } from '@/onchain-money'
import { useOffice } from '@/hooks/useOffice'
import { useTx } from '@/hooks/useTx'
import { EmptyState, Field, Spinner, UsdcAmount } from '@/components/ui'
import { EndpointEditor } from '@/components/EndpointEditor'

const BTC_ENDPOINT = (import.meta.env.VITE_BTC_MONITOR_ENDPOINT as string | undefined) ?? ''

const BTC_TEMPLATE = {
  name: 'Bitcoin Monitor',
  description: 'Watches BTC/USD around the clock. Reads live market data every 10 minutes and raises an alert when the move passes your threshold.',
  role: 'Analysis',
  price: '0.05',
}

function priceToRaw(price: string): bigint | null {
  try {
    const raw = parseUsdc(price)
    return raw > 0n && raw < 2n ** 96n ? raw : null
  } catch {
    return null
  }
}

function isHttps(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function MyAgents() {
  const { address } = useAccount()
  const { data } = useOffice()
  const { send, act, busy } = useTx()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState<string>(ROLES[0])
  const [price, setPrice] = useState('0.50')
  const [endpoint, setEndpoint] = useState('')
  const [x402, setX402] = useState(true)
  const [step, setStep] = useState<string | null>(null)
  const [unlisted, setUnlisted] = useState<bigint | null>(null)

  const mine = useMemo(() => (data?.agents ?? []).filter((a) => sameAddr(a.owner, address)), [data, address])
  const priceRaw = priceToRaw(price)
  const endpointOk = endpoint.trim() === '' || isHttps(endpoint.trim())
  const valid = name.trim().length >= 2 && description.trim().length >= 10 && priceRaw !== null && endpointOk

  const enlist = async (agentId: bigint) => {
    if (priceRaw === null) throw new Error('Enter a valid price.')
    setStep('Listing on the Cycuxio roster')
    await send({ address: OFFICE_ADDRESS, abi: officeAbi, functionName: 'enlist', args: [agentId, role, priceRaw] })
  }

  const register = async () => {
    const ok = await act('register', 'Agent registered and listed', async () => {
      try {
        setStep('Registering identity')
        const uri = encodeCard({ name: name.trim(), description: description.trim(), a2aEndpoint: endpoint.trim() || undefined, x402Support: x402 })
        const receipt = await send({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: 'register', args: [uri] })
        const [log] = parseEventLogs({ abi: identityAbi, eventName: 'Registered', logs: receipt.logs })
        if (!log) throw new Error('Registration confirmed but no agent id was emitted.')
        setUnlisted(log.args.agentId)
        await enlist(log.args.agentId)
        setUnlisted(null)
      } finally {
        setStep(null)
      }
    })
    if (ok) {
      setName('')
      setDescription('')
      setEndpoint('')
    }
  }

  const retryListing = async () => {
    if (unlisted === null) return
    const id = unlisted
    const ok = await act('enlist', 'Agent listed on the roster', async () => {
      try {
        await enlist(id)
      } finally {
        setStep(null)
      }
    })
    if (ok) setUnlisted(null)
  }

  const toggle = (agentId: bigint, agentRole: string, agentPrice: bigint, active: boolean) =>
    act(`toggle-${agentId.toString()}`, active ? 'Agent paused' : 'Agent resumed', async () => {
      await send({ address: OFFICE_ADDRESS, abi: officeAbi, functionName: 'updateListing', args: [agentId, agentRole, agentPrice, !active] })
    })

  return (
    <section className="grid gap-6 py-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="card p-6">
        <h2 className="display text-2xl font-semibold">Register an agent</h2>
        <p className="mt-1 text-sm text-[var(--muted)] text-pretty">
          This mints an ERC-8004 identity from your wallet, then lists it on the Cycuxio roster. Two transactions, both on Arc Testnet.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setName(BTC_TEMPLATE.name)
              setDescription(BTC_TEMPLATE.description)
              setRole(BTC_TEMPLATE.role)
              setPrice(BTC_TEMPLATE.price)
              setEndpoint(BTC_ENDPOINT)
              setX402(true)
            }}
          >
            Use the Bitcoin Monitor template
          </button>
          <span className="text-xs text-[var(--subtle)]">Fills this form for the Bitcoin monitoring agent.</span>
        </div>

        <div className="mt-5 grid gap-4">
          <Field label="Agent name">
            <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Market Scout" />
          </Field>
          <Field label="What it does" hint="Shown to anyone deciding whether to hire it.">
            <textarea className="field min-h-[88px]" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} placeholder="Reads onchain flows and returns a sourced one-page brief." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Suggested price (USDC)" hint={priceRaw === null ? 'Enter an amount above zero.' : undefined}>
              <input className="field num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          <Field label="A2A endpoint (optional)" hint={endpointOk ? 'Where other agents send A2A messages. HTTPS only.' : 'Use a full https:// URL.'}>
            <input className="field" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://agent.example.com/a2a" />
          </Field>
          <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <input type="checkbox" className="h-5 w-5 accent-[#f2b84b]" checked={x402} onChange={(e) => setX402(e.target.checked)} />
            Advertise x402 support in the registration file
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {address ? (
            <button type="button" className="btn btn-primary" disabled={!valid || busy !== null} onClick={() => void register()}>
              {busy === 'register' ? (
                <>
                  <Spinner /> {step ?? 'Working'}…
                </>
              ) : (
                'Register and list agent'
              )}
            </button>
          ) : (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button type="button" className="btn btn-primary" onClick={show}>
                  Connect wallet to register
                </button>
              )}
            </ConnectKitButton.Custom>
          )}
          {unlisted !== null ? (
            <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => void retryListing()}>
              {busy === 'enlist' ? <Spinner /> : null} Finish listing agent #{unlisted.toString()}
            </button>
          ) : null}
        </div>
        {unlisted !== null ? (
          <p className="mt-3 text-xs text-[var(--warn)]">Agent #{unlisted.toString()} is registered but not listed yet. Finish listing to put it on the roster.</p>
        ) : null}
      </div>

      <div>
        <h2 className="display text-2xl font-semibold">Your agents</h2>
        {!address ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Connect a wallet to see the agents you own.</p>
        ) : mine.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon={<Bot size={20} />} title="No agents yet" body="Agents you register from this wallet appear here, with controls to pause or resume them." />
          </div>
        ) : (
          <ul className="mt-3 grid gap-3">
            {mine.map((a) => (
              <li key={a.id.toString()} className="card p-4">
               <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="display truncate text-base font-semibold">{a.name}</span>
                    <span className="chip">{a.role}</span>
                    {!a.active ? <span className="chip chip-warn">Paused</span> : null}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[var(--subtle)]">
                    <UsdcAmount raw={a.priceUsdc} />
                    <span className="num">{a.tasks} tasks</span>
                    <span>{a.validated ? 'Validated' : 'Not validated'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy !== null}
                  onClick={() => void toggle(a.id, a.role, a.priceUsdc, a.active)}
                >
                  {busy === `toggle-${a.id.toString()}` ? <Spinner /> : a.active ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                  {a.active ? 'Pause' : 'Resume'}
                </button>
               </div>
               <EndpointEditor agent={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
