import { createContext, useContext } from 'react'
import type { Bundle, DataMode, Snapshot, Verdict } from '../lib/types'

export type Tab = 'terminal' | 'mempool' | 'bonds' | 'about'
export type RunPhase = 'idle' | 'ingesting' | 'consensus' | 'settling' | 'done' | 'error'

export interface RunState {
  bundleId: number | null
  phase: RunPhase
  simulated: boolean
  feeWei: bigint | null
  txHash: string | null
  votes: string[]
  verdict: Verdict | null
  error: string | null
}

export interface Wallet {
  hasProvider: boolean
  account: string | null
  chainId: number | null
}

export interface Toast {
  id: number
  kind: 'ok' | 'err' | 'info'
  text: string
  href?: string
}

export interface AppState {
  mode: DataMode
  setMode: (m: DataMode) => void
  snapshot: Snapshot
  loading: boolean
  loadError: string | null
  refresh: () => Promise<void>
  tab: Tab
  setTab: (t: Tab) => void
  selectedBundle: Bundle | null
  selectBundle: (id: number) => void
  wallet: Wallet
  connect: () => Promise<void>
  switchNetwork: () => Promise<void>
  wrongNetwork: boolean
  run: RunState
  evaluate: (bundleId: number) => Promise<void>
  resetRun: () => void
  stake: (name: string, builderHex: string, amountGen: string) => Promise<boolean>
  claim: (bundleId: number) => Promise<void>
  toasts: Toast[]
  dismissToast: (id: number) => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
