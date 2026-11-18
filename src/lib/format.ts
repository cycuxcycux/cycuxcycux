import { BaseError } from 'viem'
import { formatUsdc } from '@/onchain-money'

export const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

export const sameAddr = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** USDC atomic units to a display string with at most 2 decimals unless the value is sub-cent. */
export function usdcText(raw: bigint): string {
  const exact = formatUsdc(raw)
  const [whole, frac = ''] = exact.split('.')
  if (!frac) return `${whole}.00`
  const trimmed = frac.length <= 2 ? frac.padEnd(2, '0') : frac.replace(/0+$/, '').padEnd(2, '0')
  return `${Number(whole).toLocaleString('en-US')}.${trimmed}`
}

export const isPast = (expiredAt: bigint) => Number(expiredAt) <= Math.floor(Date.now() / 1000)

export function timeLeft(expiredAt: bigint): string {
  const diff = Number(expiredAt) - Math.floor(Date.now() / 1000)
  if (diff <= 0) return 'expired'
  if (diff < 3600) return `${Math.ceil(diff / 60)}m left`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`
  return `${Math.floor(diff / 86400)}d left`
}

export function parseOnchainError(error: unknown): string {
  const base = error instanceof BaseError ? error : null
  const text = (base?.shortMessage ?? (error instanceof Error ? error.message : '')).toLowerCase()
  if (text.includes('user rejected') || text.includes('user denied')) return 'Request cancelled in your wallet.'
  if (text.includes('insufficient funds') || text.includes('exceeds balance')) return 'Not enough USDC for this action.'
  if (text.includes('notagentowner')) return 'Only the agent owner can do this.'
  if (text.includes('notjobclient')) return 'Only the job client can record this task.'
  if (text.includes('invalidprovider')) return 'The job provider does not match the agent wallet.'
  if (text.includes('selfevaluatednegativerating')) return 'A self-evaluated task cannot receive a negative score.'
  if (text.includes('notaccepted')) return 'The agent must accept the task before a negative score can count.'
  if (text.includes('alreadyrated')) return 'This task already has a recorded score.'
  if (text.includes('reverted') || text.includes('revert')) {
    return base?.shortMessage ? `Transaction failed: ${base.shortMessage}` : 'Transaction failed. Check the task state and try again.'
  }
  if (text.includes('network') || text.includes('timeout') || text.includes('fetch')) return 'Network issue. Check your connection and retry.'
  return base?.shortMessage ?? 'Something went wrong. Please try again.'
}

export const isUserRejection = (error: unknown): boolean => {
  const text = (error instanceof Error ? error.message : '').toLowerCase()
  return text.includes('user rejected') || text.includes('user denied')
}
