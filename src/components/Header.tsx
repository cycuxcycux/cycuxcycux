import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Wallet } from 'lucide-react'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/chain'
import { shortAddr, usdcText } from '@/lib/format'
import { Logo } from '@/components/ui'

export type TabId = 'office' | 'tasks' | 'validation' | 'agents'

const TABS: { id: TabId; label: string }[] = [
  { id: 'office', label: 'Office' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'validation', label: 'Validation' },
  { id: 'agents', label: 'My agents' },
]

function WalletPill() {
  const { address } = useAccount()
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show }) => (
        <button type="button" onClick={show} className={isConnected ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}>
          <Wallet size={15} aria-hidden />
          {isConnected && address ? (
            <span className="flex items-center gap-2">
              <span className="mono text-xs">{shortAddr(address)}</span>
              {balance !== undefined ? <span className="num hidden text-xs text-[var(--subtle)] sm:inline">{usdcText(balance)} USDC</span> : null}
            </span>
          ) : (
            'Connect wallet'
          )}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

export function Header({ tab, onTab }: { tab: TabId; onTab: (tab: TabId) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(10,14,19,0.85)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="display text-xl font-semibold tracking-tight">Cycuxio</span>
          <span className="hidden items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--subtle)] sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />
            Arc Testnet
          </span>
        </div>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => onTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <WalletPill />
      </div>
    </header>
  )
}
