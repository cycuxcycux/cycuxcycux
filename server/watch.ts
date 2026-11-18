import { describeMonitor, monitor, usd, type MonitorReport } from './market'

/** Background watch: samples the market every 10 minutes and keeps a rolling 24 hour log in memory. */
export const SAMPLE_EVERY_MS = 10 * 60 * 1000
const MAX_SAMPLES = 144

export interface Sample {
  takenAt: string
  report: MonitorReport
}

const samples: Sample[] = []
let lastError: string | null = null
let started = false

export async function takeSample(): Promise<Sample | null> {
  try {
    const report = await monitor(10, 0.5)
    const sample = { takenAt: new Date().toISOString(), report }
    samples.push(sample)
    if (samples.length > MAX_SAMPLES) samples.shift()
    lastError = null
    console.log(`[watch] ${sample.takenAt} BTC ${usd(report.spot.price)} ${report.level} ${report.current.changePct}%`)
    return sample
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'sample failed'
    console.error(`[watch] sample failed: ${lastError}`)
    return null
  }
}

export function startWatch(): void {
  if (started) return
  started = true
  void takeSample()
  setInterval(() => void takeSample(), SAMPLE_EVERY_MS).unref?.()
}

export const getSamples = (): Sample[] => [...samples]
export const getLatest = (): Sample | null => samples[samples.length - 1] ?? null

export function watchStatus() {
  const latest = getLatest()
  return {
    intervalMinutes: SAMPLE_EVERY_MS / 60000,
    samples: samples.length,
    alerts: samples.filter((s) => s.report.level === 'ALERT').length,
    latestAt: latest?.takenAt ?? null,
    lastError,
  }
}

/** Plain-language summary of the last `count` scheduled samples. */
export function describeHistory(count: number): { text: string; data: Sample[] } {
  const slice = samples.slice(-Math.max(1, Math.min(MAX_SAMPLES, count)))
  if (slice.length === 0) return { text: 'The 10-minute watch has not recorded a sample yet. Try again in a moment.', data: [] }
  const prices = slice.map((s) => s.report.spot.price)
  const alerts = slice.filter((s) => s.report.level === 'ALERT')
  const first = slice[0].report.current.open
  const last = slice[slice.length - 1].report.spot.price
  const net = ((last - first) / first) * 100
  const lines = [
    `Watch log: ${slice.length} samples, one every ${SAMPLE_EVERY_MS / 60000} minutes, ${slice[0].takenAt} to ${slice[slice.length - 1].takenAt}.`,
    `BTC/USD moved ${net >= 0 ? '+' : ''}${net.toFixed(3)}% over the period, low ${usd(Math.min(...prices))}, high ${usd(Math.max(...prices))}, latest ${usd(last)}.`,
    alerts.length === 0
      ? 'No alerts were raised.'
      : `${alerts.length} alert${alerts.length === 1 ? '' : 's'} raised: ${alerts.map((a) => `${a.takenAt} (${a.report.current.changePct}%)`).join(', ')}.`,
  ]
  const latest = slice[slice.length - 1].report
  lines.push(`Latest window: ${describeMonitor(latest).split('\n').slice(1, 2).join('')}`)
  return { text: lines.join('\n'), data: slice }
}
