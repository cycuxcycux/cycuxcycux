import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID, type JobStatus } from '@/lib/chain'
import { shortAddr, usdcText } from '@/lib/format'

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden />
}

export function UsdcAmount({ raw, size = 'md' }: { raw: bigint; size?: 'md' | 'xl' }) {
  const big = size === 'xl'
  return (
    <span className="inline-flex items-center gap-1.5 num">
      <TokenUSDC variant="branded" size={big ? 28 : 16} />
      <span className={big ? 'display text-4xl font-semibold' : 'font-semibold'}>{usdcText(raw)}</span>
      <span className={big ? 'text-base text-[var(--subtle)]' : 'text-xs text-[var(--subtle)]'}>USDC</span>
    </span>
  )
}

const STATUS_STYLE: Record<JobStatus, string> = {
  Open: 'chip',
  Funded: 'chip chip-warn',
  Submitted: 'chip chip-warn',
  Completed: 'chip chip-ok',
  Rejected: 'chip chip-bad',
  Expired: 'chip chip-bad',
}

export function StatusChip({ status }: { status: JobStatus }) {
  return <span className={STATUS_STYLE[status]}>{status}</span>
}

export function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={buildAddressExplorerUrl(CHAIN_ID, address)}
      target="_blank"
      rel="noopener noreferrer"
      className="mono inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
    >
      {shortAddr(address)}
      <ExternalLink size={11} aria-hidden />
    </a>
  )
}

export function TxLink({ hash, label = 'View transaction' }: { hash: string; label?: string }) {
  return (
    <a
      href={buildTxExplorerUrl(CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
    >
      {label}
      <ExternalLink size={11} aria-hidden />
    </a>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-[var(--subtle)]">{hint}</span> : null}
    </label>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="inset flex h-12 w-12 items-center justify-center text-[var(--accent)]">{icon}</div>
      <h3 className="display text-xl font-semibold text-balance">{title}</h3>
      <p className="max-w-md text-sm text-[var(--muted)] text-pretty">{body}</p>
      {action}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex h-full w-full max-w-lg flex-col border-l border-[var(--border)] bg-[#0e141b] shadow-2xl"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <h2 className="display text-xl font-semibold">{title}</h2>
              <button type="button" onClick={onClose} className="btn btn-ghost btn-sm !px-2.5" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#f2b84b" />
      <path d="M9.5 21.5 16 9l6.5 12.5" stroke="#1a1304" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="9" r="2.4" fill="#1a1304" />
      <circle cx="9.5" cy="21.5" r="2.4" fill="#f2b84b" stroke="#1a1304" strokeWidth="2" />
      <circle cx="22.5" cy="21.5" r="2.4" fill="#f2b84b" stroke="#1a1304" strokeWidth="2" />
    </svg>
  )
}
