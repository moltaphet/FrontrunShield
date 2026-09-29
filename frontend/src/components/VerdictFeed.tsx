import { useApp } from '../state/context'
import { fmtGen, timeAgo } from '../lib/format'

export function VerdictFeed({ limit = 6 }: { limit?: number }) {
  const { snapshot, selectBundle, setTab } = useApp()
  const rows = [...snapshot.verdicts].reverse().slice(0, limit)
  const names = new Map(snapshot.sequencers.map((s) => [s.address, s.name]))
  return (
    <section className="card overflow-hidden" aria-label="Verdict history">
      <div className="px-4 py-3.5"><div className="card-title">Verdict history</div></div>
      <ul className="divide-y divide-ink-800 border-t border-ink-700">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No verdicts yet.</li>}
        {rows.map((v) => (
          <li key={v.id}>
            <button type="button" className="w-full px-4 py-3 text-left transition hover:bg-ink-850"
              onClick={() => { selectBundle(v.bundleId); setTab('mempool') }}>
              <div className="flex items-center justify-between gap-2">
                <span className={`whitespace-nowrap text-xs font-bold ${v.isToxic ? 'text-toxic-400' : 'text-shield-400'}`}>
                  {v.classification.replace('_', ' ')}
                </span>
                <span className="whitespace-nowrap font-mono text-[11px] text-slate-500">{timeAgo(v.timestamp)}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-400">
                #{v.bundleId} · {names.get(v.builderAddress) ?? 'builder'} · {v.isToxic ? `−${fmtGen(v.slashedAmount)} GEN` : 'no slash'} · {v.confidence}%
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
