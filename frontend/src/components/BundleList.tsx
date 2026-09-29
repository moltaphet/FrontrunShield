import { useApp } from '../state/context'
import { fmtUsd, timeAgo } from '../lib/format'
import { BundleBadge } from './Badges'

export function BundleList({ limit }: { limit?: number }) {
  const { snapshot, selectedBundle, selectBundle, loading } = useApp()
  const bundles = [...snapshot.bundles].reverse().slice(0, limit)
  return (
    <section className="card overflow-hidden" aria-label="Submitted bundles">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="card-title">Suspect bundles</div>
        <span className="badge border-ink-500 bg-ink-800 text-slate-300">{snapshot.bundles.length}</span>
      </div>
      <ul className="max-h-[560px] divide-y divide-ink-800 overflow-y-auto border-t border-ink-700">
        {bundles.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">{loading ? 'Loading bundles…' : 'No bundles submitted yet.'}</li>}
        {bundles.map((b) => {
          const active = selectedBundle?.id === b.id
          return (
            <li key={b.id}>
              <button type="button" onClick={() => selectBundle(b.id)} aria-current={active}
                className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${active ? 'bg-ink-800' : 'hover:bg-ink-850'}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">#{b.id}</span>
                    <span className="truncate text-sm font-semibold text-white">{b.dexPair}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{b.builderName} · {timeAgo(b.createdAt)}</div>
                  <div className="mt-1 font-mono text-[11px] text-slate-400">{fmtUsd(b.extractedCents, true)} extracted · {b.slippageBps} bps</div>
                </div>
                <BundleBadge status={b.status} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
