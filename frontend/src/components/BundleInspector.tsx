import { ArrowRight, Fuel, Skull, TrendingDown, UserX, Bot } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Bundle, Verdict } from '../lib/types'
import { bpsToPct, fmtUsd, shortAddr, shortHash } from '../lib/format'
import { legNotes, parseTrace, pricePathFor } from '../lib/trace'
import { PriceChart } from './PriceChart'
import { BundleBadge } from './Badges'

function FlowNode({ tone, icon, title, tx, note, chips }: { tone: string; icon: ReactNode; title: string; tx: string; note: string; chips: string[] }) {
  return (
    <div className={`min-w-0 flex-1 rounded-xl border p-3.5 ${tone}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 leading-tight">{title}</span>
      </div>
      <div className="mono mt-1.5 truncate text-[11px] text-slate-400" title={tx}>{shortHash(tx, 10, 6)}</div>
      <p className="mt-2 text-xs leading-snug text-slate-300">{note}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c} className="whitespace-nowrap rounded-md bg-ink-950/60 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-300">{c}</span>
        ))}
      </div>
    </div>
  )
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="flex shrink-0 items-center justify-center text-slate-500 max-lg:rotate-90 max-lg:py-1 lg:w-10">
      <div className={`flow-line w-6 ${active ? 'animate-flow text-toxic-400' : 'text-ink-500'}`} />
      <ArrowRight size={14} className={active ? 'text-toxic-400' : ''} />
    </div>
  )
}

function Stat({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850/70 p-3">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{icon}<span className="whitespace-nowrap">{label}</span></div>
      <div className="mt-1 font-mono text-xl font-bold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

/** Visual mempool trace: [Bot Frontrun] -> [Victim @ max slippage] -> [Bot Backrun]. */
export function BundleInspector({ bundle, verdict }: { bundle: Bundle; verdict: Verdict | null }) {
  const trace = parseTrace(bundle.telemetryUrl)
  const notes = legNotes(trace)
  const path = pricePathFor(bundle, trace)
  const evaluated = bundle.status !== 'PENDING'
  const toxic = bundle.status === 'TOXIC'
  const gwei = bundle.priorityGwei
  const victimGwei = notes.victimPriority
  const slipBar = Math.min(100, bundle.slippageBps / 5)

  return (
    <section className="card p-5" aria-label={`Bundle ${bundle.id} inspector`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="card-title">Mempool bundle #{bundle.id}</div>
          <h3 className="mt-1 truncate text-lg font-bold text-white">{bundle.dexPair}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Builder <span className="font-semibold text-slate-200">{bundle.builderName}</span>
            <span className="mono ml-1.5 text-slate-500">{shortAddr(bundle.builderAddress)}</span>
            {notes.block && <span className="ml-2 text-slate-500">· {notes.block}</span>}
          </p>
        </div>
        <BundleBadge status={bundle.status} />
      </div>

      <div className="mt-4 flex flex-col gap-1 lg:flex-row lg:items-stretch">
        <FlowNode
          tone="border-toxic-600/60 bg-toxic-600/10"
          icon={<Bot size={16} className="text-toxic-400" />}
          title="Bot Frontrun Swap"
          tx={bundle.frontrunTx}
          note={notes.frontrun}
          chips={[`${gwei} gwei tip`, 'position N']}
        />
        <Connector active={!evaluated || toxic} />
        <FlowNode
          tone="border-amberx-500/60 bg-amberx-500/10"
          icon={<UserX size={16} className="text-amberx-400" />}
          title="Victim Order: Max Slippage Hit"
          tx={bundle.victimTx}
          note={`Retail swap filled ${bpsToPct(bundle.slippageBps)} worse than quoted.`}
          chips={[`${bundle.slippageBps} bps slippage`, victimGwei !== null ? `${victimGwei} gwei tip` : 'low tip']}
        />
        <Connector active={!evaluated || toxic} />
        <FlowNode
          tone="border-toxic-600/60 bg-toxic-600/10"
          icon={<Bot size={16} className="text-toxic-400" />}
          title="Bot Backrun Liquidation"
          tx={bundle.backrunTx}
          note={notes.backrun}
          chips={[`+${fmtUsd(bundle.extractedCents, true)} profit`]}
        />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700" title={`Victim slippage ${bpsToPct(bundle.slippageBps)} of a 5% typical limit`}>
        <div className={`h-full rounded-full ${slipBar > 60 ? 'bg-toxic-500' : slipBar > 20 ? 'bg-amberx-500' : 'bg-shield-500'}`} style={{ width: `${Math.max(2, slipBar)}%` }} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Stat icon={<Skull size={13} />} tone="text-toxic-400" label="Extracted profit" value={fmtUsd(bundle.extractedCents)} sub="bot net of gas" />
        <Stat icon={<TrendingDown size={13} />} tone="text-amberx-400" label="Victim loss" value={fmtUsd(bundle.lossCents)} sub={bundle.lossCents === 0 ? 'no measurable harm' : `${bpsToPct(bundle.slippageBps)} worse fill`} />
        <Stat icon={<Fuel size={13} />} tone="text-cyanx-400" label="Priority fee" value={`${gwei} gwei`}
          sub={victimGwei !== null ? `${(gwei / Math.max(victimGwei, 1)).toFixed(0)}× the victim’s ${victimGwei} gwei` : 'frontrun tip'} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-ink-700 bg-ink-850/70 p-3">
          <div className="card-title mb-1">Pool price path</div>
          <PriceChart path={path} />
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-850/70 p-3 text-xs">
          <div className="card-title mb-2">Trace evidence</div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt className="text-slate-500">Same block</dt>
            <dd className="text-slate-200">{notes.sameBlock === null ? 'n/a' : notes.sameBlock ? 'yes - bot legs bracket victim' : 'no'}</dd>
            <dt className="text-slate-500">Victim</dt>
            <dd className="mono truncate text-slate-200">{bundle.victimAddress ? shortAddr(bundle.victimAddress) : 'not named'}</dd>
            <dt className="text-slate-500">Reporter</dt>
            <dd className="mono truncate text-slate-200">{shortAddr(bundle.reporter)}</dd>
            <dt className="text-slate-500">Telemetry</dt>
            <dd className="mono truncate text-slate-200" title={bundle.telemetryUrl}>{bundle.telemetryUrl ? new URL(bundle.telemetryUrl).host : 'none'}</dd>
            {verdict && (<>
              <dt className="text-slate-500">Verdict</dt>
              <dd className={toxic ? 'font-semibold text-toxic-400' : 'font-semibold text-shield-400'}>{verdict.classification.replace('_', ' ')} · {verdict.confidence}%</dd>
            </>)}
          </dl>
        </div>
      </div>
    </section>
  )
}
