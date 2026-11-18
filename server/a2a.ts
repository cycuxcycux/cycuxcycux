import { randomUUID } from 'node:crypto'
import { describeMonitor, getSpot, monitor, usd } from './market'
import { describeHistory, getLatest, SAMPLE_EVERY_MS, watchStatus } from './watch'

type Json = Record<string, unknown>

export function buildCard(origin: string): Json {
  return {
    protocolVersion: '0.3.0',
    name: 'Bitcoin Monitor',
    description:
      'Watches the Bitcoin market around the clock. Takes a reading every 10 minutes, evaluates a rolling 10-minute window of live BTC/USD data, and raises an alert when the move passes your threshold.',
    url: `${origin}/a2a`,
    preferredTransport: 'JSONRPC',
    additionalInterfaces: [{ url: `${origin}/a2a`, transport: 'JSONRPC' }],
    provider: { organization: 'Cycuxio', url: origin },
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'btc-monitor',
        name: 'Bitcoin 10-minute monitor',
        description:
          'Evaluates the latest 10 minutes (configurable, 2 to 60) of 1-minute BTC/USD candles against the previous window and returns a NORMAL or ALERT status.',
        tags: ['bitcoin', 'btc', 'monitoring', 'market-data', 'alerts'],
        examples: ['Monitor bitcoin for the last 10 minutes', 'Alert me if BTC moves more than 1% in 10 minutes', 'Watch BTC over the last 30 minutes'],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['text/plain', 'application/json'],
      },
      {
        id: 'btc-watch-log',
        name: 'Bitcoin watch log',
        description: 'Summarizes the scheduled 10-minute readings from the last hour, 6 hours or 24 hours, including every alert raised.',
        tags: ['bitcoin', 'history', 'report'],
        examples: ['Give me the watch report for the last hour', 'What happened to bitcoin today?'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain', 'application/json'],
      },
      {
        id: 'btc-price',
        name: 'Bitcoin spot price',
        description: 'Returns the current BTC/USD price, bid, ask and 24 hour volume.',
        tags: ['bitcoin', 'price', 'market-data'],
        examples: ['What is the bitcoin price?'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain', 'application/json'],
      },
    ],
  }
}

const rpcError = (id: unknown, code: number, message: string, data?: string): Json => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message, ...(data ? { data } : {}) },
})

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

type Intent =
  | { mode: 'price' }
  | { mode: 'history'; samples: number }
  | { mode: 'monitor'; windowMinutes: number; thresholdPct: number }

function readIntent(parts: unknown[]): Intent {
  let text = ''
  let data: Json = {}
  for (const part of parts) {
    if (!isRecord(part)) continue
    if (part.kind === 'text' && typeof part.text === 'string') text += ` ${part.text.slice(0, 2000)}`
    if (part.kind === 'data' && isRecord(part.data)) data = { ...data, ...part.data }
  }
  const lower = text.toLowerCase()
  const minutes = /(\d{1,3})\s*[- ]?\s*(?:min|mins|minute|minutes)\b/.exec(lower)
  const pct = /(\d{1,2}(?:\.\d+)?)\s*%/.exec(lower)
  const hours = /(\d{1,2})\s*[- ]?\s*(?:h|hr|hrs|hour|hours)\b/.exec(lower)

  const windowMinutes = Number(data.windowMinutes ?? (minutes ? minutes[1] : 10))
  const thresholdPct = Number(data.thresholdPct ?? (pct ? pct[1] : 0.5))
  const wantsHistory = /history|report|log|today|last hour|past hour|\bhours?\b|overnight|since/.test(lower)
  const wantsPrice = /price|spot|quote|how much|worth/.test(lower)
  const wantsMonitor = /monitor|watch|alert|move|volatil|trend|window|minutes?\b/.test(lower)

  if (data.windowMinutes === undefined && wantsHistory && !minutes) {
    const h = hours ? Number(hours[1]) : /today|24|day/.test(lower) ? 24 : 1
    return { mode: 'history', samples: Math.round(Math.min(24, Math.max(1, h)) * (60 / (SAMPLE_EVERY_MS / 60000))) }
  }
  if (wantsPrice && !wantsMonitor && data.windowMinutes === undefined) return { mode: 'price' }
  return {
    mode: 'monitor',
    windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : 10,
    thresholdPct: Number.isFinite(thresholdPct) ? thresholdPct : 0.5,
  }
}

async function answer(intent: Intent): Promise<{ text: string; data: Json }> {
  if (intent.mode === 'price') {
    const spot = await getSpot()
    return {
      text: `BTC/USD ${usd(spot.price)} (bid ${usd(spot.bid)}, ask ${usd(spot.ask)}). 24h volume ${spot.volume24hBtc.toFixed(2)} BTC. Source: ${spot.source}, ${spot.time}.`,
      data: { type: 'btc-price', ...spot },
    }
  }
  if (intent.mode === 'history') {
    const { text, data } = describeHistory(intent.samples)
    return { text, data: { type: 'btc-watch-log', watch: watchStatus(), samples: data } }
  }
  const isDefault = intent.windowMinutes === 10 && intent.thresholdPct === 0.5
  const fresh = getLatest()
  const useCached = isDefault && fresh && Date.now() - Date.parse(fresh.takenAt) < 60_000
  const report = useCached && fresh ? fresh.report : await monitor(intent.windowMinutes, intent.thresholdPct)
  return { text: describeMonitor(report), data: { type: 'btc-monitor', watch: watchStatus(), ...report } }
}

/** Handles one A2A JSON-RPC 2.0 request and returns the JSON-RPC response object. */
export async function handleRpc(body: unknown): Promise<Json> {
  if (!isRecord(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(isRecord(body) ? body.id : null, -32600, 'Invalid Request')
  }
  const { id, method } = body
  const params = isRecord(body.params) ? body.params : {}

  switch (method) {
    case 'message/send': {
      const message = params.message
      if (!isRecord(message) || !Array.isArray(message.parts) || message.parts.length === 0) {
        return rpcError(id, -32602, 'Invalid params', 'params.message.parts is required')
      }
      if (message.role !== undefined && message.role !== 'user') return rpcError(id, -32602, 'Invalid params', 'message.role must be "user"')
      try {
        const { text, data } = await answer(readIntent(message.parts as unknown[]))
        return {
          jsonrpc: '2.0',
          id,
          result: {
            kind: 'message',
            messageId: randomUUID(),
            role: 'agent',
            contextId: typeof message.contextId === 'string' ? message.contextId : randomUUID(),
            parts: [
              { kind: 'text', text },
              { kind: 'data', data },
            ],
          },
        }
      } catch (error) {
        return rpcError(id, -32603, 'Market data is unavailable right now', error instanceof Error ? error.message : undefined)
      }
    }
    case 'tasks/get':
    case 'tasks/cancel':
      return rpcError(id, -32001, 'Task not found', 'This agent answers every request immediately and keeps no tasks.')
    case 'message/stream':
    case 'tasks/resubscribe':
      return rpcError(id, -32004, 'This operation is not supported', 'Streaming is not enabled. Use message/send.')
    case 'tasks/pushNotificationConfig/set':
    case 'tasks/pushNotificationConfig/get':
    case 'tasks/pushNotificationConfig/list':
    case 'tasks/pushNotificationConfig/delete':
      return rpcError(id, -32003, 'Push Notification is not supported')
    case 'agent/getAuthenticatedExtendedCard':
      return rpcError(id, -32007, 'Authenticated Extended Card not configured')
    default:
      return rpcError(id, -32601, 'Method not found')
  }
}

export const parseErrorResponse = (): Json => rpcError(null, -32700, 'Parse error')
