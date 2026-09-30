import type { BundleStatus, SequencerStatus } from '../lib/types'

const SEQ: Record<SequencerStatus, string> = {
  ACTIVE: 'border-shield-600 bg-shield-600/15 text-shield-400',
  SLASHED: 'border-toxic-600 bg-toxic-600/15 text-toxic-400',
  UNDER_REVIEW: 'border-amberx-500 bg-amberx-500/15 text-amberx-400',
  EXITED: 'border-ink-500 bg-ink-800 text-slate-400',
}
const BUN: Record<BundleStatus, string> = {
  PENDING: 'border-amberx-500 bg-amberx-500/15 text-amberx-400',
  TOXIC: 'border-toxic-600 bg-toxic-600/15 text-toxic-400',
  BENIGN: 'border-shield-600 bg-shield-600/15 text-shield-400',
  INCONCLUSIVE: 'border-ink-500 bg-ink-800 text-slate-300',
  FORGED: 'border-toxic-600 bg-toxic-600/15 text-toxic-400',
}

export function SequencerBadge({ status }: { status: SequencerStatus }) {
  return <span className={`badge ${SEQ[status] ?? SEQ.ACTIVE}`}>{status.replace('_', ' ')}</span>
}

export function BundleBadge({ status }: { status: BundleStatus }) {
  return <span className={`badge ${BUN[status] ?? BUN.PENDING}`}>{status}</span>
}
