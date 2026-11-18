// The "main agent": an A2A client that asks the Bitcoin Monitor for a reading every 10 minutes.
const EVERY_MS = 10 * 60 * 1000
const MAX_CALLS = 144

export interface AgentCall {
  at: string
  target: string
  ok: boolean
  level?: string
  price?: number
  text?: string
  error?: string
}

const calls: AgentCall[] = []
let started = false

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

async function callOnce(target: string): Promise<AgentCall> {
  const at = new Date().toISOString()
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'message/send',
        params: { message: { kind: 'message', role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: 'Monitor bitcoin for the last 10 minutes' }] } },
      }),
    })
    const json = (await res.json()) as unknown
    if (!isRecord(json) || !isRecord(json.result) || !Array.isArray(json.result.parts)) {
      const detail = isRecord(json) && isRecord(json.error) ? String(json.error.message) : 'unexpected reply'
      throw new Error(detail)
    }
    const parts = json.result.parts as unknown[]
    const textPart = parts.find((p) => isRecord(p) && p.kind === 'text')
    const dataPart = parts.find((p) => isRecord(p) && p.kind === 'data')
    const data = isRecord(dataPart) && isRecord(dataPart.data) ? dataPart.data : {}
    const spot = isRecord(data.spot) ? data.spot : {}
    return {
      at,
      target,
      ok: true,
      level: typeof data.level === 'string' ? data.level : undefined,
      price: typeof spot.price === 'number' ? spot.price : undefined,
      text: isRecord(textPart) && typeof textPart.text === 'string' ? textPart.text : undefined,
    }
  } catch (error) {
    return { at, target, ok: false, error: error instanceof Error ? error.message : 'call failed' }
  }
}

export function startMainAgent(port: number): void {
  if (started) return
  started = true
  const target = process.env.BTC_AGENT_URL ?? `http://127.0.0.1:${port}/a2a`
  const tick = async () => {
    const call = await callOnce(target)
    calls.push(call)
    if (calls.length > MAX_CALLS) calls.shift()
    console.log(`[main-agent] ${call.at} ${call.ok ? `BTC ${call.price} ${call.level}` : `failed: ${call.error}`}`)
  }
  // Give the HTTP server a moment to start accepting requests before the first call.
  setTimeout(() => void tick(), 3000)
  setInterval(() => void tick(), EVERY_MS).unref?.()
}

export const mainAgentStatus = () => ({
  intervalMinutes: EVERY_MS / 60000,
  target: process.env.BTC_AGENT_URL ?? 'this server (/a2a)',
  calls: calls.length,
  latest: calls[calls.length - 1] ?? null,
  recent: calls.slice(-12).reverse(),
})
