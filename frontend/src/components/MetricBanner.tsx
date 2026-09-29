import { Coins, Landmark, ScanSearch, Skull } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../state/context'
import { fmtGen } from '../lib/format'

function Kpi({ icon, label, value, unit, sub, tone }: { icon: ReactNode; label: string; value: string; unit?: string; sub: string; tone: string }) {
  return (
    <div className="card flex min-w-0 items-center gap-3 px-4 py-3">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <div className="card-title truncate">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-mono text-2xl font-bold tracking-tight text-white">{value}</span>
          {unit && <span className="text-xs font-semibold text-slate-400">{unit}</span>}
        </div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

export function MetricBanner() {
  const { snapshot: { metrics: m }, loading } = useApp()
  const dash = loading && m.sequencerCount === 0
  const v = (s: string) => (dash ? '—' : s)
  return (
    <section aria-label="Protocol metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<Skull size={20} />} tone="bg-toxic-600/15 text-toxic-400" label="Total Slashed" unit="GEN"
        value={v(fmtGen(m.totalSlashed))} sub={`${m.toxicCount} toxic verdict${m.toxicCount === 1 ? '' : 's'}`} />
      <Kpi icon={<Coins size={20} />} tone="bg-shield-600/15 text-shield-400" label="Active Sequencer Collateral" unit="GEN"
        value={v(fmtGen(m.activeBonds))} sub={`${m.sequencerCount} bonded builders`} />
      <Kpi icon={<ScanSearch size={20} />} tone="bg-cyanx-500/15 text-cyanx-400" label="Analyzed Bundles"
        value={v(String(m.bundlesAnalyzed))} sub={`${m.bundlesTotal - m.bundlesAnalyzed} pending · ${m.benignCount} cleared · ${m.inconclusiveCount} inconclusive`} />
      <Kpi icon={<Landmark size={20} />} tone="bg-amberx-500/15 text-amberx-400" label="Victim Restitution Escrow" unit="GEN"
        value={v(fmtGen(m.insurancePool))} sub={`${fmtGen(m.restitutionPaid)} GEN paid to victims`} />
    </section>
  )
}
