export type SequencerStatus = 'ACTIVE' | 'SLASHED' | 'UNDER_REVIEW' | 'EXITED'
export type BundleStatus = 'PENDING' | 'TOXIC' | 'BENIGN' | 'INCONCLUSIVE'

export interface Sequencer {
  address: string
  name: string
  stakedAmount: bigint
  status: SequencerStatus
  totalSlashed: bigint
  reputation: number
  pendingBundles: number
  slashCount: number
  createdAt: number
  /** Unix seconds; 0 when no unbonding is in progress. */
  unstakeRequestedAt: number
  /** Earliest release time; 0 when no unbonding is in progress. */
  unstakeAvailableAt: number
}

export interface Bundle {
  id: number
  builderAddress: string
  builderName: string
  reporter: string
  victimAddress: string
  victimTx: string
  frontrunTx: string
  backrunTx: string
  dexPair: string
  slippageBps: number
  extractedCents: number
  lossCents: number
  priorityGwei: number
  /** Derived on-chain from the governor gateway + tx hashes; never reporter-supplied. */
  telemetryUrl: string
  reporterBond: bigint
  status: BundleStatus
  verdictId: number
  restitutionClaimed: boolean
  createdAt: number
}

export interface Verdict {
  id: number
  bundleId: number
  builderAddress: string
  consensusState: string
  isToxic: boolean
  classification: string
  confidence: number
  rationale: string
  slashedAmount: bigint
  reporterBounty: bigint
  reporterBondReturned: boolean
  timestamp: number
}

export interface Metrics {
  totalSlashed: bigint
  activeBonds: bigint
  insurancePool: bigint
  restitutionPaid: bigint
  bundlesAnalyzed: number
  bundlesTotal: number
  toxicCount: number
  benignCount: number
  inconclusiveCount: number
  sequencerCount: number
  contractBalance: bigint
  minBond: bigint
  reporterBond: bigint
  bountyBps: number
  unstakeCooldown: number
  reporterEscrow: bigint
  bondsForfeited: bigint
  bountiesPaid: bigint
  solvent: boolean
}

export interface Snapshot {
  sequencers: Sequencer[]
  bundles: Bundle[]
  verdicts: Verdict[]
  metrics: Metrics
}

export type DataMode = 'live' | 'guest'

/** Price path drawn in the bundle inspector (USD per unit of the base asset). */
export interface PricePath {
  before: number
  afterFrontrun: number
  victimExec: number
  afterBackrun: number
  external: number | null
}
