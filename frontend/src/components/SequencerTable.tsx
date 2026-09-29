import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useApp } from '../state/context'
import { fmtCountdown, fmtGen, shortAddr, timeAgo } from '../lib/format'
import type { Sequencer } from '../lib/types'
import { SequencerBadge } from './Badges'

/** Wall clock in unix seconds, refreshed every 30 s for the cooldown countdown. */
function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** Unbonding column: Unstake button -> cooldown indicator -> Finalize. Only the
 *  builder's own key can act (the contract enforces it); guest mode simulates. */
function UnstakeCell({ s }: { s: Sequencer }) {
  const { mode, wallet, requestUnstake, finalizeUnstake, snapshot } = useApp()
  const owner = mode === 'guest' || wallet.account?.toLowerCase() === s.address.toLowerCase()
  const cooldown = snapshot.metrics.unstakeCooldown
  const now = useNowSeconds()
  const btn = 'btn-ghost whitespace-nowrap px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50'

  if (s.status === 'EXITED' || s.stakedAmount === 0n) return <span className="text-xs text-slate-500">Unbonded</span>
  if (s.unstakeRequestedAt === 0) {
    return (
      <button type="button" className={btn} disabled={!owner} onClick={() => void requestUnstake(s.address)}
        title={owner ? `Starts a ${fmtCountdown(cooldown)} cooldown; the bond stays slashable meanwhile.` : 'Only the builder’s own key can unstake.'}>
        <LogOut size={12} className="mr-1 inline" />Unstake
      </button>
    )
  }
  const left = s.unstakeAvailableAt - now
  const blocked = s.pendingBundles > 0
  if (left > 0) {
    return (
      <span className="whitespace-nowrap text-xs text-amberx-400" title="Bond remains slashable until released">
        Unbonding · {fmtCountdown(left)} left
      </span>
    )
  }
  return (
    <div className="flex flex-col items-start gap-0.5">
      <button type="button" className={btn} disabled={!owner || blocked} onClick={() => void finalizeUnstake(s.address)}>
        Release bond
      </button>
      {blocked && <span className="whitespace-nowrap text-[11px] text-amberx-400">locked: {s.pendingBundles} pending</span>}
    </div>
  )
}

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
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-y border-ink-700 bg-ink-850/60 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="whitespace-nowrap px-5 py-2.5 font-semibold">Builder</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Bonded (GEN)</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Status</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Reputation</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Unbonding</th>
              <th className="whitespace-nowrap px-5 py-2.5 font-semibold">Slashing penalty history</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">{loading ? 'Loading registry…' : 'No builders have posted a bond yet.'}</td></tr>
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
                  <td className="px-3 py-3"><UnstakeCell s={s} /></td>
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
