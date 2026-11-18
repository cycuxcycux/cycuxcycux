// Live Bitcoin market data from the Coinbase Exchange public API (no key required).
const BASE = 'https://api.exchange.coinbase.com/products/BTC-USD'
const CACHE_MS = 8000
const cache = new Map<string, { at: number; data: unknown }>()

export interface Spot {
  pair: string
  source: string
  price: number
  bid: number
  ask: number
  volume24hBtc: number
  time: string
}

export interface WindowStats {
  minutes: number
  open: number
  close: number
  high: number
  low: number
  changeUsd: number
  changePct: number
  rangePct: number
  volatilityBps: number
  volumeBtc: number
}

export interface MonitorReport {
  pair: string
  source: string
  asOf: string
  windowMinutes: number
  thresholdPct: number
  level: 'NORMAL' | 'ALERT'
  direction: 'up' | 'down' | 'flat'
  reasons: string[]
  spot: Spot
  current: WindowStats
  previous: WindowStats | null
}

interface Candle {
  time: number
  low: number
  high: number
  open: number
  close: number
  volume: number
}

async function getJson(url: string): Promise<unknown> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'cycuxio-btc-monitor/1.0' } })
    if (!res.ok) throw new Error(`Market data request failed (${res.status})`)
    const data = (await res.json()) as unknown
    cache.set(url, { at: Date.now(), data })
    return data
  } finally {
    clearTimeout(timer)
  }
}

const num = (value: unknown): number => {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('Unexpected market data format')
  return n
}

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits

export async function getSpot(): Promise<Spot> {
  const raw = (await getJson(`${BASE}/ticker`)) as Record<string, unknown>
  return {
    pair: 'BTC-USD',
    source: 'Coinbase Exchange',
    price: num(raw.price),
    bid: num(raw.bid),
    ask: num(raw.ask),
    volume24hBtc: num(raw.volume),
    time: String(raw.time),
  }
}

function windowStats(candles: Candle[]): WindowStats | null {
  if (candles.length === 0) return null
  const open = candles[0].open
  const close = candles[candles.length - 1].close
  const high = Math.max(...candles.map((c) => c.high))
  const low = Math.min(...candles.map((c) => c.low))
  const returns: number[] = []
  for (let i = 1; i < candles.length; i++) returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close)
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const variance = returns.length ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length : 0
  return {
    minutes: candles.length,
    open: round(open),
    close: round(close),
    high: round(high),
    low: round(low),
    changeUsd: round(close - open),
    changePct: round(((close - open) / open) * 100, 3),
    rangePct: round(((high - low) / low) * 100, 3),
    volatilityBps: round(Math.sqrt(variance) * 10000, 3),
    volumeBtc: round(candles.reduce((a, c) => a + c.volume, 0)),
  }
}

/** Evaluates the latest `windowMinutes` of 1-minute candles against the window before and flags unusual movement. */
export async function monitor(windowMinutes = 10, thresholdPct = 0.5): Promise<MonitorReport> {
  const w = Math.min(60, Math.max(2, Math.round(windowMinutes)))
  const threshold = Math.min(20, Math.max(0.05, thresholdPct))
  const end = new Date()
  const start = new Date(end.getTime() - (w * 2 + 2) * 60000)
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`
  const url = `${BASE}/candles?granularity=60&start=${iso(start)}&end=${iso(end)}`
  const [spot, raw] = await Promise.all([getSpot(), getJson(url)])
  if (!Array.isArray(raw)) throw new Error('Unexpected candle format')
  const candles: Candle[] = (raw as unknown[])
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) throw new Error('Unexpected candle format')
      const [time, low, high, open, close, volume] = row as unknown[]
      return { time: num(time), low: num(low), high: num(high), open: num(open), close: num(close), volume: num(volume) }
    })
    .sort((a, b) => a.time - b.time)
  if (candles.length < 2) throw new Error('Not enough recent candles from the exchange')

  const current = windowStats(candles.slice(-w))
  if (!current) throw new Error('No candles in the window')
  const previous = windowStats(candles.slice(-w * 2, -w))
  const moveAlert = Math.abs(current.changePct) >= threshold
  const rangeAlert = current.rangePct >= threshold * 2
  const reasons: string[] = []
  if (moveAlert) reasons.push(`net move of ${current.changePct}% passes the ${threshold}% threshold`)
  if (rangeAlert) reasons.push(`high-low range of ${current.rangePct}% passes ${round(threshold * 2)}%`)

  return {
    pair: 'BTC-USD',
    source: 'Coinbase Exchange 1-minute candles',
    asOf: spot.time,
    windowMinutes: w,
    thresholdPct: threshold,
    level: moveAlert || rangeAlert ? 'ALERT' : 'NORMAL',
    direction: current.changePct > 0.02 ? 'up' : current.changePct < -0.02 ? 'down' : 'flat',
    reasons,
    spot,
    current,
    previous,
  }
}

export const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function describeMonitor(m: MonitorReport): string {
  const c = m.current
  const sign = c.changePct >= 0 ? '+' : ''
  const lines = [
    `BTC/USD ${usd(m.spot.price)} (${m.source}, ${m.asOf})`,
    `${m.windowMinutes}-minute window: ${m.direction.toUpperCase()} ${sign}${c.changePct}% (${usd(c.changeUsd)}), high ${usd(c.high)}, low ${usd(c.low)}.`,
    `Volatility ${c.volatilityBps} bps per minute, volume ${c.volumeBtc} BTC.`,
  ]
  if (m.previous) lines.push(`Previous ${m.windowMinutes} minutes: ${m.previous.changePct >= 0 ? '+' : ''}${m.previous.changePct}%, range ${m.previous.rangePct}%.`)
  lines.push(m.level === 'ALERT' ? `Status: ALERT, ${m.reasons.join('; ')}.` : `Status: NORMAL, no move beyond the ${m.thresholdPct}% threshold.`)
  return lines.join('\n')
}
