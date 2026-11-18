import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Network } from 'lucide-react'
import { IDENTITY_REGISTRY, identityAbi } from '@/lib/chain'
import { encodeCard } from '@/lib/agentCard'
import type { AgentView } from '@/hooks/useOffice'
import { useTx } from '@/hooks/useTx'
import { Spinner } from '@/components/ui'

interface Probe {
  name: string
  skills: number
}

/** Fetches the A2A agent card from an endpoint and confirms it speaks A2A over HTTPS. */
async function probeEndpoint(endpoint: string): Promise<Probe> {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:') throw new Error('The endpoint must use https.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`The endpoint answered with status ${res.status}.`)
    const card = (await res.json()) as { name?: unknown; protocolVersion?: unknown; skills?: unknown }
    if (typeof card.protocolVersion !== 'string' || typeof card.name !== 'string') throw new Error('The endpoint did not return an A2A agent card.')
    return { name: card.name.slice(0, 60), skills: Array.isArray(card.skills) ? card.skills.length : 0 }
  } finally {
    clearTimeout(timer)
  }
}

/** Points an existing ERC-8004 registration at an A2A endpoint by updating its agent URI. */
export function EndpointEditor({ agent }: { agent: AgentView }) {
  const { send, act, busy } = useTx()
  const [value, setValue] = useState(agent.card?.a2aEndpoint ?? '')
  const [probe, setProbe] = useState<Probe | null>(null)
  const [checking, setChecking] = useState(false)
  const key = `endpoint-${agent.id.toString()}`
  const current = agent.card?.a2aEndpoint

  const save = async () => {
    const endpoint = value.trim()
    setChecking(true)
    let found: Probe
    try {
      found = await probeEndpoint(endpoint)
    } catch (error) {
      toast.error(error instanceof Error && error.name !== 'AbortError' ? error.message : 'The endpoint could not be reached.')
      return
    } finally {
      setChecking(false)
    }
    setProbe(found)
    await act(key, 'A2A endpoint connected to the registration', async () => {
      const uri = encodeCard({
        name: agent.card?.name ?? agent.name,
        description: agent.card?.description ?? `${agent.role} agent on Cycuxio.`,
        a2aEndpoint: endpoint,
        x402Support: agent.card?.x402Support ?? false,
      })
      await send({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: 'setAgentURI', args: [agent.id, uri] })
    })
  }

  const unchanged = value.trim() === (current ?? '')

  return (
    <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
      <div className="flex items-center gap-2 text-xs text-[var(--subtle)]">
        <Network size={13} aria-hidden />
        {current ? (
          <span className="flex min-w-0 items-center gap-1">
            Connected to <span className="mono truncate text-[var(--muted)]">{current}</span>
          </span>
        ) : (
          'No A2A endpoint connected yet'
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="field min-w-[200px] flex-1"
          aria-label={`A2A endpoint for ${agent.name}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setProbe(null)
          }}
          placeholder="https://your-agent.example.com/a2a"
        />
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || checking || unchanged || value.trim().length < 12} onClick={() => void save()}>
          {busy === key || checking ? <Spinner /> : null}
          {current ? 'Update endpoint' : 'Connect endpoint'}
        </button>
      </div>
      {probe ? (
        <p className="flex items-center gap-1.5 text-xs text-[var(--success)]">
          <CheckCircle2 size={13} aria-hidden /> Reached {probe.name} with {probe.skills} skills.
        </p>
      ) : null}
    </div>
  )
}
