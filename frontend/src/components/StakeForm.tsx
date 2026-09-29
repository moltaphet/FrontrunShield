import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { useApp } from '../state/context'
import { fmtGen } from '../lib/format'

export function StakeForm() {
  const { stake, mode, snapshot } = useApp()
  const [name, setName] = useState('')
  const [builder, setBuilder] = useState('')
  const [amount, setAmount] = useState('0.25')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const ok = await stake(name, builder, amount)
    setBusy(false)
    if (ok) setName('')
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card p-5" aria-label="Stake builder bond">
      <div className="card-title">Post a builder bond</div>
      <p className="mt-1 text-xs leading-snug text-slate-500">
        Collateral is what makes a verdict bite: a toxic sandwich costs the builder half of it. Minimum {fmtGen(snapshot.metrics.minBond || 250000000000000000n)} GEN.
        {mode === 'live' ? ' Sends a payable transaction with the fee deposit attached.' : ' Guest mode simulates the bond locally.'}
      </p>
      <label className="mt-4 block text-xs font-semibold text-slate-300" htmlFor="b-name">Builder name</label>
      <input id="b-name" className="input mt-1" value={name} maxLength={48} required onChange={(e) => setName(e.target.value)} placeholder="e.g. Atlas Relay" />
      <label className="mt-3 block text-xs font-semibold text-slate-300" htmlFor="b-addr">Builder address <span className="font-normal text-slate-500">(optional - defaults to you)</span></label>
      <input id="b-addr" className="input mt-1 font-mono text-xs" value={builder} onChange={(e) => setBuilder(e.target.value)} placeholder="0x…" spellCheck={false} pattern="^(0x[0-9a-fA-F]{40})?$" />
      <label className="mt-3 block text-xs font-semibold text-slate-300" htmlFor="b-amt">Bond (GEN)</label>
      <input id="b-amt" className="input mt-1 font-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <button type="submit" className="btn-primary mt-4 w-full" disabled={busy}><Lock size={15} /> {busy ? 'Waiting for consensus…' : 'Stake Builder Bond'}</button>
    </form>
  )
}
