import { SequencerTable } from '../components/SequencerTable'
import { StakeForm } from '../components/StakeForm'
import { MetricBanner } from '../components/MetricBanner'

export function BondsView() {
  return (
    <div className="space-y-5">
      <MetricBanner />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <SequencerTable />
        <StakeForm />
      </div>
    </div>
  )
}
