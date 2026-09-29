import { useApp } from '../state/context'
import { BundleInspector } from '../components/BundleInspector'
import { ForensicsRunner } from '../components/ForensicsRunner'
import { BundleList } from '../components/BundleList'

export function MempoolView() {
  const { selectedBundle, snapshot, claim, wallet, mode } = useApp()
  const verdict = selectedBundle ? snapshot.verdicts.find((v) => v.bundleId === selectedBundle.id) ?? null : null
  const canClaim =
    selectedBundle?.status === 'TOXIC' && !selectedBundle.restitutionClaimed && selectedBundle.victimAddress !== '' &&
    (mode === 'guest' || wallet.account?.toLowerCase() === selectedBundle.victimAddress.toLowerCase())
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <BundleList />
      <div className="min-w-0 space-y-5">
        {selectedBundle ? (
          <>
            <BundleInspector bundle={selectedBundle} verdict={verdict} />
            <ForensicsRunner bundle={selectedBundle} verdict={verdict} />
            {canClaim && (
              <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-slate-300">You are the named victim of this toxic bundle. Restitution is available from the insurance pool.</p>
                <button type="button" className="btn-primary" onClick={() => void claim(selectedBundle.id)}>Claim restitution</button>
              </div>
            )}
          </>
        ) : (
          <div className="card p-10 text-center text-slate-500">Select a bundle to inspect it.</div>
        )}
      </div>
    </div>
  )
}
