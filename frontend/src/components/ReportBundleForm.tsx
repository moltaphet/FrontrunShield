import { useState, type FormEvent } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useApp } from '../state/context'
import { REPORTER_BOND_LABEL } from '../lib/chain'

const HASH = /^0x[0-9a-fA-F]{64}$/
const ADDR = /^0x[0-9a-fA-F]{40}$/

/** Cents from a "1234.56" USD string, or null when malformed. */
function usdToCents(v: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v.trim())
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0) : null
}

/** File a suspect bundle. There is deliberately no telemetry field: the
 *  contract derives the evidence endpoint from its governor-verified gateway
 *  and the three tx hashes, so a reporter cannot serve forged evidence. */
export function ReportBundleForm() {
  const { snapshot, submitBundle, mode } = useApp()
  const [f, setF] = useState({
    builder: '', victim: '', victimTx: '', frontrunTx: '', backrunTx: '',
    pair: '', slippage: '', extracted: '', loss: '', gwei: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const builders = snapshot.sequencers.filter((s) => s.status !== 'EXITED' && s.stakedAmount > 0n)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const extracted = usdToCents(f.extracted)
    const loss = usdToCents(f.loss)
    const slippage = Number(f.slippage)
    const gwei = Number(f.gwei)
    const hashes = [f.victimTx, f.frontrunTx, f.backrunTx].map((h) => h.trim().toLowerCase())
    if (!f.builder) return setError('Choose the accused builder.')
    if (f.victim.trim() !== '' && !ADDR.test(f.victim.trim())) return setError('Victim address must be a 0x… 20-byte address (or empty).')
    if (!hashes.every((h) => HASH.test(h))) return setError('Each transaction hash must be 0x + 64 hex characters.')
    if (new Set(hashes).size !== 3) return setError('The three transactions must be distinct.')
    if (!Number.isInteger(slippage) || slippage < 0 || slippage > 10_000) return setError('Slippage is an integer between 0 and 10000 bps.')
    if (extracted === null || loss === null) return setError('USD amounts look like 1234.56.')
    if (!Number.isInteger(gwei) || gwei < 0) return setError('Priority fee is a whole number of gwei.')
    if (f.pair.trim() === '') return setError('Enter the DEX pair.')
    setError(null)
    setBusy(true)
    const ok = await submitBundle({
      builderAddress: f.builder, victimAddress: f.victim.trim().toLowerCase(),
      victimTx: hashes[0], frontrunTx: hashes[1], backrunTx: hashes[2], dexPair: f.pair.trim(),
      slippageBps: slippage, extractedCents: extracted, lossCents: loss, priorityGwei: gwei,
    })
    setBusy(false)
    if (ok) setF({ builder: f.builder, victim: '', victimTx: '', frontrunTx: '', backrunTx: '', pair: '', slippage: '', extracted: '', loss: '', gwei: '' })
  }

  const label = 'mt-3 block text-xs font-semibold text-slate-300'
  return (
    <form onSubmit={(e) => void submit(e)} className="card p-5" aria-label="Report a suspect bundle" noValidate>
      <div className="card-title">Report a suspect bundle</div>
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amberx-500/50 bg-amberx-500/10 p-3" role="note">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amberx-400" />
        <p className="text-xs leading-snug text-slate-300">
          <span className="font-bold text-amberx-400">{REPORTER_BOND_LABEL} Reporter Security Deposit.</span>{' '}
          Escrowed with your report. A <b>toxic</b> verdict returns it plus a 10% bounty from the slashed bond;
          a <b>benign</b> or inconclusive verdict forfeits it to the insurance pool.
          {mode === 'guest' ? ' Guest mode simulates the deposit locally.' : ''}
        </p>
      </div>
      <p className="mt-2 text-xs leading-snug text-slate-500">
        Evidence is fetched by validators from the protocol’s telemetry gateway using these three hashes - you can’t supply a URL.
      </p>

      <label className={label} htmlFor="r-builder">Accused builder</label>
      <select id="r-builder" className="input mt-1" value={f.builder} onChange={set('builder')} required>
        <option value="">Select a bonded builder…</option>
        {builders.map((s) => <option key={s.address} value={s.address}>{s.name}</option>)}
      </select>
      <label className={label} htmlFor="r-pair">DEX pair</label>
      <input id="r-pair" className="input mt-1" value={f.pair} maxLength={64} onChange={set('pair')} placeholder="WETH/USDC Uniswap V3 0.05%" />
      <label className={label} htmlFor="r-ftx">Frontrun tx hash</label>
      <input id="r-ftx" className="input mt-1 font-mono text-xs" value={f.frontrunTx} onChange={set('frontrunTx')} placeholder="0x…" spellCheck={false} />
      <label className={label} htmlFor="r-vtx">Victim tx hash</label>
      <input id="r-vtx" className="input mt-1 font-mono text-xs" value={f.victimTx} onChange={set('victimTx')} placeholder="0x…" spellCheck={false} />
      <label className={label} htmlFor="r-btx">Backrun tx hash</label>
      <input id="r-btx" className="input mt-1 font-mono text-xs" value={f.backrunTx} onChange={set('backrunTx')} placeholder="0x…" spellCheck={false} />
      <label className={label} htmlFor="r-victim">Victim address <span className="font-normal text-slate-500">(optional - entitles them to restitution)</span></label>
      <input id="r-victim" className="input mt-1 font-mono text-xs" value={f.victim} onChange={set('victim')} placeholder="0x…" spellCheck={false} />

      <div className="mt-1 grid grid-cols-2 gap-x-3">
        <div>
          <label className={label} htmlFor="r-slip">Victim slippage (bps)</label>
          <input id="r-slip" className="input mt-1 font-mono" inputMode="numeric" value={f.slippage} onChange={set('slippage')} placeholder="495" />
        </div>
        <div>
          <label className={label} htmlFor="r-gwei">Frontrun tip (gwei)</label>
          <input id="r-gwei" className="input mt-1 font-mono" inputMode="numeric" value={f.gwei} onChange={set('gwei')} placeholder="412" />
        </div>
        <div>
          <label className={label} htmlFor="r-ext">Bot profit (USD)</label>
          <input id="r-ext" className="input mt-1 font-mono" inputMode="decimal" value={f.extracted} onChange={set('extracted')} placeholder="18420.00" />
        </div>
        <div>
          <label className={label} htmlFor="r-loss">Victim loss (USD)</label>
          <input id="r-loss" className="input mt-1 font-mono" inputMode="decimal" value={f.loss} onChange={set('loss')} placeholder="16100.00" />
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-xs text-toxic-400">{error}</p>}
      <button type="submit" className="btn-primary mt-4 w-full" disabled={busy}>
        {busy ? 'Waiting for consensus…' : `File report · ${REPORTER_BOND_LABEL} deposit`}
      </button>
    </form>
  )
}
