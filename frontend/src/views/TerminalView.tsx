import { useApp } from '../state/context'
import { MetricBanner } from '../components/MetricBanner'
import { BundleInspector } from '../components/BundleInspector'
import { ForensicsRunner } from '../components/ForensicsRunner'
import { SequencerTable } from '../components/SequencerTable'
import { BundleList } from '../components/BundleList'
import { VerdictFeed } from '../components/VerdictFeed'

export function TerminalView() {
  const { selectedBundle, snapshot, loading } = useApp()
  const verdict = selectedBundle ? snapshot.verdicts.find((v) => v.bundleId === selectedBundle.id) ?? null : null
  return (
    <div className="space-y-5">
      <MetricBanner />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {selectedBundle ? (
            <BundleInspector bundle={selectedBundle} verdict={verdict} />
          ) : (
            <div className="card p-10 text-center text-slate-500">{loading ? 'Loading mempool bundles…' : 'No bundles to inspect yet.'}</div>
          )}
          <SequencerTable compact />
        </div>
        <div className="min-w-0 space-y-5">
          {selectedBundle && <ForensicsRunner bundle={selectedBundle} verdict={verdict} />}
          <BundleList limit={5} />
          <VerdictFeed limit={4} />
        </div>
      </div>
    </div>
  )
}
