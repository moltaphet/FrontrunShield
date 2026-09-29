import { useApp } from '../state/context'
import { fmtGen, shortAddr, timeAgo } from '../lib/format'
import { SequencerBadge } from './Badges'

function RepBar({ score }: { score: number }) {
  const tone = score >= 75 ? 'bg-shield-500' : score >= 45 ? 'bg-amberx-500' : 'bg-toxic-500'
  return (
    <div className="flex items-center gap-2" title={`Reputation ${score}/100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700"><div className={`h-full ${tone}`} style={{ width: `${score}%` }} /></div>
      <span className="font-mono text-xs text-slate-400">{score}</span>
    </div>
  )
}

export function SequencerTable({ compact = false }: { compact?: boolean }) {
  const { snapshot, loading } = useApp()
  const { sequencers, verdicts } = snapshot
  const rows = [...sequencers].sort((a, b) => (a.stakedAmount < b.stakedAmount ? 1 : -1))

  return (
    <section className="card overflow-hidden" aria-label="Sequencer registry">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <div className="card-title">Sequencer Registry</div>
          <p className="mt-1 text-xs text-slate-500">Builders, posted collateral, standing and slashing history</p>
        </div>
        <span className="badge border-ink-500 bg-ink-800 text-slate-300">{sequencers.length} builders</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-y border-ink-700 bg-ink-850/60 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="whitespace-nowrap px-5 py-2.5 font-semibold">Builder</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Bonded (GEN)</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Status</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Reputation</th>
              <th className="whitespace-nowrap px-5 py-2.5 font-semibold">Slashing penalty history</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">{loading ? 'Loading registry…' : 'No builders have posted a bond yet.'}</td></tr>
            )}
            {(compact ? rows.slice(0, 6) : rows).map((s) => {
              const history = verdicts.filter((v) => v.builderAddress === s.address && v.isToxic)
              return (
                <tr key={s.address} className="border-b border-ink-800 transition hover:bg-ink-850/50">
                  <td className="px-5 py-3">
                    <div className="whitespace-nowrap font-semibold text-white">{s.name}</div>
                    <div className="mono text-[11px] text-slate-500">{shortAddr(s.address)} · since {timeAgo(s.createdAt)}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold text-white">{fmtGen(s.stakedAmount)}</td>
                  <td className="px-3 py-3">
                    <SequencerBadge status={s.status} />
                    {s.pendingBundles > 0 && <span className="ml-1.5 whitespace-nowrap text-[11px] text-amberx-400">{s.pendingBundles} pending</span>}
                  </td>
                  <td className="px-3 py-3"><RepBar score={s.reputation} /></td>
                  <td className="px-5 py-3">
                    {s.slashCount === 0 && s.totalSlashed === 0n ? (
                      <span className="text-xs text-slate-500">Clean record</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-toxic-400">−{fmtGen(s.totalSlashed)} GEN</span>
                        <span className="whitespace-nowrap text-[11px] text-slate-500">{s.slashCount}× slashed</span>
                        {history.map((v) => (
                          <span key={v.id} className="whitespace-nowrap rounded-md bg-toxic-600/15 px-1.5 py-0.5 font-mono text-[10.5px] text-toxic-400" title={v.rationale}>
                            bundle #{v.bundleId} −{fmtGen(v.slashedAmount)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
