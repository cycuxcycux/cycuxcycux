import { useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { isAddress, keccak256, toBytes, type Address, type Hex } from 'viem'
import { Inbox, ShieldCheck } from 'lucide-react'
import { CHAIN_ID, VALIDATION_REGISTRY, ZERO_HASH, validationAbi } from '@/lib/chain'
import { sameAddr, shortAddr } from '@/lib/format'
import { useOffice } from '@/hooks/useOffice'
import { useTx } from '@/hooks/useTx'
import { AddressLink, EmptyState, Field, Spinner } from '@/components/ui'

interface Request {
  hash: Hex
  agentId: bigint
  response: number
  responded: boolean
  lastUpdate: bigint
}

function useInbox(validator: Address | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['cycuxio-validator-inbox', validator],
    enabled: !!client && !!validator,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Request[]> => {
      if (!client || !validator) return []
      const hashes = await client.readContract({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: 'getValidatorRequests', args: [validator] })
      const recent = hashes.slice(-30)
      if (recent.length === 0) return []
      const statuses = await client.multicall({
        allowFailure: true,
        contracts: recent.map((hash) => ({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: 'getValidationStatus', args: [hash] }) as const),
      })
      const out: Request[] = []
      statuses.forEach((s, i) => {
        if (s.status !== 'success') return
        const [, agentId, response, responseHash, , lastUpdate] = s.result
        out.push({ hash: recent[i], agentId, response, responded: responseHash !== ZERO_HASH, lastUpdate })
      })
      return out.reverse()
    },
  })
}

function RequestForm() {
  const { address } = useAccount()
  const { data } = useOffice()
  const { send, act, busy } = useTx()
  const mine = useMemo(() => (data?.agents ?? []).filter((a) => sameAddr(a.owner, address)), [data, address])
  const validators = useMemo(() => (data?.agents ?? []).filter((a) => a.role.toLowerCase() === 'validator' && !sameAddr(a.owner, address)), [data, address])

  const [agentId, setAgentId] = useState('')
  const [pick, setPick] = useState('custom')
  const [custom, setCustom] = useState('')

  const validator = pick === 'custom' ? custom.trim() : pick
  const validatorOk = isAddress(validator) && !sameAddr(validator, address)
  const selected = agentId || (mine[0]?.id.toString() ?? '')

  const request = () =>
    act('vrequest', 'Validation requested', async () => {
      const id = BigInt(selected)
      const requestURI = `data:application/json,${encodeURIComponent(JSON.stringify({ type: 'cycuxio-identity-check', agentId: id.toString() }))}`
      const requestHash = keccak256(toBytes(`cycuxio:identity:${id.toString()}:${validator.toLowerCase()}:${Date.now()}`))
      await send({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: 'validationRequest', args: [validator, id, requestURI, requestHash] })
    })

  return (
    <div className="card p-6">
      <h2 className="display text-xl font-semibold">Get your agent validated</h2>
      <p className="mt-1 text-sm text-[var(--muted)] text-pretty">
        Ask an independent wallet to check your agent. A validator that does not own the agent scores it from 0 to 100, and 70 or more earns the Validated badge.
      </p>
      {!address ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button type="button" className="btn btn-primary mt-4" onClick={show}>
              Connect wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      ) : mine.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--subtle)]">You do not own an agent on the roster yet. Register one in My agents first.</p>
      ) : (
        <div className="mt-4 grid gap-4">
          <Field label="Agent">
            <select className="field" value={selected} onChange={(e) => setAgentId(e.target.value)}>
              {mine.map((a) => (
                <option key={a.id.toString()} value={a.id.toString()}>
                  {a.name} (#{a.id.toString()})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Validator">
            <select className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="custom">Enter a wallet address</option>
              {validators.map((v) => (
                <option key={v.id.toString()} value={v.owner}>
                  {v.name} · {shortAddr(v.owner)}
                </option>
              ))}
            </select>
          </Field>
          {pick === 'custom' ? (
            <Field label="Validator wallet" hint={custom && !validatorOk ? 'Enter a valid address that is not your own.' : 'This wallet answers from its own Validation inbox.'}>
              <input className="field mono" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0x…" />
            </Field>
          ) : null}
          <div>
            <button type="button" className="btn btn-primary" disabled={!validatorOk || busy !== null} onClick={() => void request()}>
              {busy === 'vrequest' ? <Spinner /> : null} Request validation
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InboxItem({ req }: { req: Request }) {
  const { data } = useOffice()
  const { send, act, busy } = useTx()
  const queryClient = useQueryClient()
  const [score, setScore] = useState(90)
  const [note, setNote] = useState('')
  const agent = data?.agents.find((a) => a.id === req.agentId)

  const respond = async () => {
    const ok = await act(`vrespond-${req.hash}`, 'Identity attested', async () => {
      const responseHash = keccak256(toBytes(note.trim() || `identity verified: ${score}`))
      await send({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: 'validationResponse', args: [req.hash, score, '', responseHash, 'identity'] })
    })
    if (ok) await queryClient.invalidateQueries({ queryKey: ['cycuxio-validator-inbox'] })
  }

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="display text-base font-semibold">{agent?.name ?? `Agent #${req.agentId.toString()}`}</span>
          {agent ? <span className="chip">{agent.role}</span> : null}
        </div>
        {req.responded ? <span className="chip chip-ok">Scored {req.response}</span> : <span className="chip chip-warn">Waiting for you</span>}
      </div>
      {agent ? (
        <div className="mt-2 grid gap-1 text-sm text-[var(--muted)]">
          <p className="text-pretty">{agent.card?.description || 'No description published.'}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--subtle)]">
            <span className="flex items-center gap-1.5">
              Owner <AddressLink address={agent.owner} />
            </span>
            <span className="flex items-center gap-1.5">
              Wallet <AddressLink address={agent.wallet} />
            </span>
            {agent.card?.a2aEndpoint ? (
              <a className="text-[var(--accent)] hover:text-[var(--accent-hover)]" href={agent.card.a2aEndpoint} target="_blank" rel="noopener noreferrer">
                A2A endpoint
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {!req.responded ? (
        <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4">
          <Field label={`Score: ${score}`} hint="70 or higher marks the identity as validated.">
            <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="w-full accent-[#f2b84b]" />
          </Field>
          <Field label="Note (hashed onchain)">
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wallet matches, endpoint answers, card is consistent" />
          </Field>
          <div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void respond()}>
              {busy === `vrespond-${req.hash}` ? <Spinner /> : <ShieldCheck size={15} aria-hidden />} Attest identity
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function InboxPanel() {
  const { address } = useAccount()
  const { data, isLoading } = useInbox(address)

  return (
    <div>
      <h2 className="display text-xl font-semibold">Validator inbox</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Requests sent to your wallet. Check the agent, then attest with a score.</p>
      <div className="mt-4">
        {!address ? (
          <p className="text-sm text-[var(--subtle)]">Connect a wallet to see requests addressed to it.</p>
        ) : isLoading ? (
          <div className="card h-28 animate-pulse" />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Inbox size={20} />} title="Nothing to validate" body="When an agent owner asks your wallet to validate their agent, the request lands here." />
        ) : (
          <ul className="grid gap-3">
            {data.map((r) => (
              <InboxItem key={r.hash} req={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function ValidationDesk() {
  return (
    <section className="grid gap-6 py-8 lg:grid-cols-2">
      <RequestForm />
      <InboxPanel />
    </section>
  )
}
