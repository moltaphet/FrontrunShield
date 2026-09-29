import { Check, Database, Gavel, Loader2, Network, Play, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp, type RunPhase } from '../state/context'
import type { Bundle, Verdict } from '../lib/types'
import { fmtGen } from '../lib/format'
import { FEE_DEPOSIT_LABEL, explorerTx } from '../lib/chain'
import { BundleBadge } from './Badges'

type StepState = 'idle' | 'active' | 'done'

const STEPS: { title: string; sub: string; icon: ReactNode; detail: string }[] = [
  {
    title: 'Mempool State & Orderbook Ingestion',
    sub: 'Coinbase / Uniswap DEX graph',
    icon: <Database size={18} />,
    detail: 'Each validator fetches the bundle trace and an independent reference price feed (Coinbase spot vs the Uniswap pool graph).',
  },
  {
    title: 'GenVM Multi-Validator Intent Consensus',
    sub: 'LLM committee: malicious extraction vs fair arb',
    icon: <Network size={18} />,
    detail: 'Five validators run the forensic prompt independently. They must agree on the verdict and on confidence within a tolerance band.',
  },
  {
    title: 'On-Chain Economic Slashing & Insurance Restitution',
    sub: 'Instant bond confiscation',
    icon: <Gavel size={18} />,
    detail: 'A toxic verdict confiscates 50% of the builder’s bond into the victim insurance pool. A benign verdict clears the builder.',
  },
]

function stepStates(phase: RunPhase, evaluated: boolean): StepState[] {
  if (evaluated && phase === 'idle') return ['done', 'done', 'done']
  switch (phase) {
    case 'ingesting': return ['active', 'idle', 'idle']
    case 'consensus': return ['done', 'active', 'idle']
    case 'settling': return ['done', 'done', 'active']
    case 'done': return ['done', 'done', 'done']
    default: return ['idle', 'idle', 'idle']
  }
}

function StepRow({ i, state, title, sub, icon, detail }: { i: number; state: StepState; title: string; sub: string; icon: ReactNode; detail: string }) {
  const ring = state === 'done' ? 'border-shield-500 bg-shield-500 text-ink-950' : state === 'active' ? 'border-cyanx-400 bg-cyanx-500/15 text-cyanx-400 animate-pulseRing' : 'border-ink-600 bg-ink-800 text-slate-500'
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {i < 2 && <span className={`absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 ${state === 'done' ? 'bg-shield-500' : 'bg-ink-600'}`} />}
      <span className={`z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition ${ring}`}>
        {state === 'done' ? <Check size={18} strokeWidth={3} /> : state === 'active' ? <Loader2 size={18} className="animate-spin" /> : icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <div className={`text-sm font-bold ${state === 'idle' ? 'text-slate-400' : 'text-white'}`}>Step {i + 1} · {title}</div>
        <div className="text-xs font-medium text-cyanx-400">{sub}</div>
        <p className={`mt-1 text-xs leading-snug ${state === 'active' ? 'text-slate-300' : 'text-slate-500'}`}>{detail}</p>
      </div>
    </li>
  )
}

function VerdictPanel({ verdict, votes, txHash }: { verdict: Verdict; votes: string[]; txHash: string | null }) {
  const toxic = verdict.isToxic
  return (
    <div className={`mt-4 animate-fadeUp rounded-xl border p-4 ${toxic ? 'border-toxic-600/70 bg-toxic-600/10' : 'border-shield-600/70 bg-shield-600/10'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`text-base font-extrabold tracking-tight ${toxic ? 'text-toxic-400' : 'text-shield-400'}`}>
          {toxic ? 'TOXIC SANDWICH · BOND SLASHED' : verdict.classification === 'INCONCLUSIVE' ? 'INCONCLUSIVE · NO SLASH' : 'BENIGN ARBITRAGE · CLEARED'}
        </div>
        <span className="badge border-ink-500 bg-ink-800 text-slate-300">{verdict.consensusState}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ink-950/50 p-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</div><div className="font-mono text-lg font-bold text-white">{verdict.confidence}%</div></div>
        <div className="rounded-lg bg-ink-950/50 p-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">Slashed</div><div className="whitespace-nowrap font-mono text-lg font-bold text-white">{fmtGen(verdict.slashedAmount)} <span className="text-xs text-slate-400">GEN</span></div></div>
        <div className="rounded-lg bg-ink-950/50 p-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Validator votes</div>
          <div className="mt-1.5 flex justify-center gap-1.5" aria-label={`Votes: ${votes.join(', ')}`}>
            {(votes.length ? votes : ['—']).map((v, i) => (
              <span key={i} title={v} className={`h-3 w-3 rounded-full ${v === 'agree' ? 'bg-shield-400' : v === 'disagree' ? 'bg-toxic-400' : 'bg-ink-500'}`} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-300">{verdict.rationale}</p>
      {txHash && (
        <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-cyanx-400 hover:underline">
          Consensus transaction on explorer ↗
        </a>
      )}
    </div>
  )
}

export function ForensicsRunner({ bundle, verdict }: { bundle: Bundle; verdict: Verdict | null }) {
  const { run, evaluate, resetRun, mode } = useApp()
  const mine = run.bundleId === bundle.id
  const phase: RunPhase = mine ? run.phase : 'idle'
  const evaluated = bundle.status !== 'PENDING'
  const states = stepStates(phase, evaluated)
  const busy = phase === 'ingesting' || phase === 'consensus' || phase === 'settling'
  const shownVerdict = (mine && run.verdict) || verdict
  const showVerdict = shownVerdict && (evaluated || phase === 'done')

  return (
    <section className="card p-5" aria-label="Live consensus forensics runner">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="card-title">Live Consensus Forensics Runner</div>
          <p className="mt-1 truncate text-xs text-slate-500">Bundle #{bundle.id} · {bundle.dexPair}</p>
        </div>
        <BundleBadge status={bundle.status} />
      </div>

      <ol className="mt-5" aria-label="Forensics steps">
        {STEPS.map((s, i) => <StepRow key={s.title} i={i} state={states[i]} {...s} />)}
      </ol>

      {phase === 'error' && mine && (
        <div role="alert" className="mt-3 rounded-lg border border-toxic-600 bg-toxic-600/10 p-3 text-xs text-toxic-400">
          {run.error}
        </div>
      )}

      {showVerdict && shownVerdict && <VerdictPanel verdict={shownVerdict} votes={mine ? run.votes : []} txHash={mine ? run.txHash : null} />}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!evaluated && phase !== 'done' && (
          <button type="button" className="btn-danger" disabled={busy} onClick={() => void evaluate(bundle.id)}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {busy ? 'Consensus running…' : 'Evaluate Bundle Forensics'}
          </button>
        )}
        {(phase === 'error' || phase === 'done') && mine && (
          <button type="button" className="btn-ghost" onClick={resetRun}><RotateCcw size={14} /> Reset</button>
        )}
        {!evaluated && phase !== 'done' && (
          <span className="text-xs text-slate-500">
            {mode === 'guest'
              ? 'Simulated: no wallet prompt, nothing is sent.'
              : `MetaMask will prompt with a ${FEE_DEPOSIT_LABEL} fee deposit attached${run.feeWei ? ` (quoted ${fmtGen(run.feeWei, 4)} GEN)` : ''}.`}
          </span>
        )}
        {evaluated && phase === 'idle' && <span className="text-xs text-slate-500">This bundle was already adjudicated - the verdict is final.</span>}
      </div>
    </section>
  )
}
