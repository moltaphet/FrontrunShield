import { AlertTriangle, FlaskConical, RefreshCw } from 'lucide-react'
import { useApp } from '../state/context'
import { CONTRACT_ADDRESS, explorerAddress } from '../lib/chain'
import { shortAddr } from '../lib/format'

/** Says where the numbers on screen come from, and surfaces a failed live read. */
export function DataBanner() {
  const { mode, loadError, refresh, setMode, loading } = useApp()
  if (mode === 'guest') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amberx-500/40 bg-amberx-500/10 px-4 py-2.5 text-sm text-amberx-400">
        <FlaskConical size={16} className="shrink-0" />
        <span className="font-semibold">Guest Mode</span>
        <span className="text-slate-300">Simulated dataset - explore the graphs and run a slashing without a wallet. Nothing touches the chain.</span>
      </div>
    )
  }
  if (loadError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-toxic-600 bg-toxic-600/10 px-4 py-2.5 text-sm text-toxic-400">
        <AlertTriangle size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 break-words">Could not read the live contract: {loadError}</span>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => void refresh()}><RefreshCw size={13} /> Retry</button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setMode('guest')}>Use Guest Mode</button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2 text-xs text-slate-400">
      <span className={`h-2 w-2 rounded-full ${loading ? 'animate-pulse bg-amberx-400' : 'bg-shield-400'}`} />
      <span className="font-semibold text-slate-200">Live contract</span>
      <a className="mono text-cyanx-400 hover:underline" href={explorerAddress(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">{shortAddr(CONTRACT_ADDRESS)} ↗</a>
      <span>· refreshes every 20s</span>
    </div>
  )
}
