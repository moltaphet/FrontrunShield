import { AlertTriangle } from 'lucide-react'
import { useApp } from '../state/context'
import { CHAIN_ID, NETWORK_NAME } from '../lib/chain'

/** Sticky red bar shown when the wallet is on any chain other than Studio Next. */
export function NetworkAlert() {
  const { wrongNetwork, wallet, switchNetwork } = useApp()
  if (!wrongNetwork) return null
  return (
    <div role="alert" className="sticky top-16 z-30 border-b border-toxic-600 bg-toxic-600/95 text-white backdrop-blur">
      <div className="flex flex-nowrap items-center justify-between gap-3 px-6 py-2">
        <div className="flex min-w-0 flex-nowrap items-center gap-2 text-sm font-medium">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="truncate">
            Wrong network: your wallet is on chain {wallet.chainId}. FrontrunShield transactions run on {NETWORK_NAME} ({CHAIN_ID}).
          </span>
        </div>
        <button
          type="button"
          onClick={() => void switchNetwork()}
          className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-toxic-600 transition hover:bg-slate-100"
        >
          Switch to {NETWORK_NAME} ({CHAIN_ID})
        </button>
      </div>
    </div>
  )
}
