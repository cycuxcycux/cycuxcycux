import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import type { Abi, Address, SimulateContractParameters, TransactionReceipt } from 'viem'
import { CHAIN_ID } from '@/lib/chain'
import { isUserRejection, parseOnchainError } from '@/lib/format'
import { useOffice } from '@/hooks/useOffice'

export interface Call {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

/** Sends contract writes on Arc Testnet: switches chain, simulates for a readable revert, waits for the receipt. */
export function useTx() {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const { refetch } = useOffice()
  const [busy, setBusy] = useState<string | null>(null)

  const send = useCallback(
    async (call: Call): Promise<TransactionReceipt> => {
      if (!address) throw new Error('Connect your wallet first.')
      if (!publicClient) throw new Error('Network client is not ready.')
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
      await publicClient.simulateContract({ ...call, account: address } as unknown as SimulateContractParameters)
      const hash = await writeContractAsync({ ...call, chainId: CHAIN_ID })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')
      return receipt
    },
    [address, chainId, publicClient, switchChainAsync, writeContractAsync],
  )

  /** Runs one user action with a busy key, toasts the outcome, and refreshes office data. */
  const act = useCallback(
    async (key: string, successMessage: string, fn: () => Promise<void>): Promise<boolean> => {
      setBusy(key)
      try {
        await fn()
        toast.success(successMessage)
        await refetch()
        return true
      } catch (error) {
        if (!isUserRejection(error)) toast.error(parseOnchainError(error))
        return false
      } finally {
        setBusy(null)
      }
    },
    [refetch],
  )

  return { send, act, busy, publicClient }
}
