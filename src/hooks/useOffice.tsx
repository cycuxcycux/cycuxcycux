import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address, Hex, PublicClient } from 'viem'
import {
  CHAIN_ID,
  IDENTITY_REGISTRY,
  OFFICE_ADDRESS,
  OFFICE_CONFIGURED,
  REPUTATION_REGISTRY,
  VALIDATION_REGISTRY,
  AGENTIC_COMMERCE,
  ZERO_HASH,
  JOB_STATUS,
  agentLabel,
  commerceAbi,
  identityAbi,
  officeAbi,
  reputationAbi,
  validationAbi,
  type JobStatus,
} from '@/lib/chain'
import { resolveCard, type AgentCard } from '@/lib/agentCard'
import { sameAddr } from '@/lib/format'

const MAX_AGENTS = 150
const MAX_TASKS = 200
const VALIDATED_MIN_SCORE = 70

export interface AgentView {
  id: bigint
  name: string
  role: string
  priceUsdc: bigint
  active: boolean
  owner: Address
  wallet: Address
  card: AgentCard | null
  repCount: number
  repScore: number | null
  validationCount: number
  validationAvg: number | null
  validated: boolean
  tasks: number
  settled: number
}

export interface JobView {
  id: bigint
  client: Address
  provider: Address
  evaluator: Address
  description: string
  budget: bigint
  expiredAt: bigint
  status: JobStatus
}

export interface TaskView {
  id: bigint
  jobId: bigint
  agentId: bigint
  client: Address
  parentTaskId: bigint
  rated: boolean
  accepted: boolean
  provider: Address
  job: JobView | null
}

export interface OfficeStats {
  agents: number
  validated: number
  tasksRecorded: number
  tasksSettled: number
  settledVolume: bigint
}

export interface OfficeData {
  agents: AgentView[]
  tasks: TaskView[]
  stats: OfficeStats
}

interface OfficeContextValue {
  data: OfficeData | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

const OfficeContext = createContext<OfficeContextValue | null>(null)

type Settled<T> = { status: 'success'; result: T } | { status: 'failure'; error: Error }

const ok = <T,>(entry: Settled<T> | undefined): T | undefined => (entry && entry.status === 'success' ? entry.result : undefined)

async function fetchOffice(client: PublicClient, office: Address): Promise<OfficeData> {
  const [agentIdsAll, taskCountRaw] = await Promise.all([
    client.readContract({ address: office, abi: officeAbi, functionName: 'getAgentIds' }),
    client.readContract({ address: office, abi: officeAbi, functionName: 'taskCount' }),
  ])
  const ids = agentIdsAll.slice(0, MAX_AGENTS)
  const taskCount = Number(taskCountRaw)
  const offset = Math.max(0, taskCount - MAX_TASKS)

  const [listings, owners, uris, wallets, reps, validationLists, tasksRaw] = await Promise.all([
    client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: office, abi: officeAbi, functionName: 'getListing', args: [id] }) as const) }),
    client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: 'ownerOf', args: [id] }) as const) }),
    client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: 'tokenURI', args: [id] }) as const) }),
    client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: 'getAgentWallet', args: [id] }) as const) }),
    client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: REPUTATION_REGISTRY, abi: reputationAbi, functionName: 'getSummary', args: [id, [office], 'cycuxio-task', ''] }) as const) }),
    client.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: 'getAgentValidations', args: [id] }) as const) }),
    taskCount > 0
      ? client.readContract({ address: office, abi: officeAbi, functionName: 'getTasks', args: [BigInt(offset), BigInt(MAX_TASKS)] })
      : Promise.resolve([] as const),
  ])

  const hashes: { agentIndex: number; hash: Hex }[] = []
  validationLists.forEach((entry, agentIndex) => {
    for (const hash of ok(entry) ?? []) hashes.push({ agentIndex, hash })
  })
  const statuses = hashes.length
    ? await client.multicall({
        allowFailure: true,
        contracts: hashes.slice(0, 400).map(({ hash }) => ({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: 'getValidationStatus', args: [hash] }) as const),
      })
    : []

  const jobIds = tasksRaw.map((t) => t.jobId)
  const jobResults = jobIds.length
    ? await client.multicall({
        allowFailure: true,
        contracts: jobIds.map((jobId) => ({ address: AGENTIC_COMMERCE, abi: commerceAbi, functionName: 'getJob', args: [jobId] }) as const),
      })
    : []

  const cards = await Promise.all(uris.map((entry) => (ok(entry) ? resolveCard(ok(entry) as string) : Promise.resolve(null))))

  const tasks: TaskView[] = tasksRaw.map((t, i) => {
    const job = ok(jobResults[i])
    return {
      id: BigInt(offset + i + 1),
      jobId: t.jobId,
      agentId: t.agentId,
      client: t.client,
      parentTaskId: t.parentTaskId,
      rated: t.rated,
      accepted: t.accepted,
      provider: t.provider,
      job: job
        ? {
            id: job.id,
            client: job.client,
            provider: job.provider,
            evaluator: job.evaluator,
            description: job.description,
            budget: job.budget,
            expiredAt: job.expiredAt,
            status: JOB_STATUS[job.status] ?? 'Open',
          }
        : null,
    }
  })

  const agents: AgentView[] = ids.map((id, i) => {
    const listing = ok(listings[i])
    const owner = ok(owners[i]) ?? ('0x0000000000000000000000000000000000000000')
    const wallet = ok(wallets[i]) ?? owner
    const rep = ok(reps[i])
    const repCount = rep ? Number(rep[0]) : 0
    const repScore = rep && repCount > 0 ? Number(rep[1]) / 10 ** rep[2] : null

    let vCount = 0
    let vTotal = 0
    hashes.slice(0, 400).forEach((h, k) => {
      if (h.agentIndex !== i) return
      const status = ok(statuses[k])
      if (!status) return
      const [validator, , response, responseHash] = status
      if (responseHash === ZERO_HASH || sameAddr(validator, owner)) return
      vCount += 1
      vTotal += response
    })
    const validationAvg = vCount > 0 ? vTotal / vCount : null

    const agentTasks = tasks.filter((t) => t.agentId === id)
    const card = cards[i]
    return {
      id,
      name: card?.name ?? agentLabel(id),
      role: listing?.role ?? 'Agent',
      priceUsdc: listing?.priceUsdc ? BigInt(listing.priceUsdc) : 0n,
      active: listing?.active ?? false,
      owner,
      wallet,
      card,
      repCount,
      repScore,
      validationCount: vCount,
      validationAvg,
      validated: validationAvg !== null && validationAvg >= VALIDATED_MIN_SCORE,
      tasks: agentTasks.length,
      settled: agentTasks.filter((t) => t.job?.status === 'Completed').length,
    }
  })

  const settledTasks = tasks.filter((t) => t.job?.status === 'Completed')
  return {
    agents,
    tasks,
    stats: {
      agents: agentIdsAll.length,
      validated: agents.filter((a) => a.validated).length,
      tasksRecorded: taskCount,
      tasksSettled: settledTasks.length,
      settledVolume: settledTasks.reduce((sum, t) => sum + (t.job?.budget ?? 0n), 0n),
    },
  }
}

export function OfficeProvider({ children }: { children: ReactNode }) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  const query = useQuery({
    queryKey: ['cycuxio-office', OFFICE_ADDRESS],
    enabled: !!client && OFFICE_CONFIGURED,
    refetchInterval: 15_000,
    queryFn: () => fetchOffice(client as PublicClient, OFFICE_ADDRESS),
  })
  const value = useMemo<OfficeContextValue>(
    () => ({ data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch }),
    [query.data, query.isLoading, query.isError, query.refetch],
  )
  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>
}

export function useOffice(): OfficeContextValue {
  const ctx = useContext(OfficeContext)
  if (!ctx) throw new Error('useOffice must be used inside OfficeProvider')
  return ctx
}
