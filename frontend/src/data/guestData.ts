import type { Bundle, Metrics, Sequencer, Snapshot, Verdict } from '../lib/types'

/**
 * Guest-mode dataset. Everything here is illustrative: tx hashes are derived
 * strings, not mainnet transactions, and the extra builders are fictional. It
 * exists so a steward can explore the whole UI - inspect bundle graphs, run the
 * forensics stepper, watch a bond get slashed - without a wallet or any GEN.
 */

const GEN = 10n ** 18n
/** Mirrors the contract's economic constants. */
export const GUEST_REPORTER_BOND = GEN / 20n
export const GUEST_BOUNTY_BPS = 1000
export const GUEST_COOLDOWN = 3 * 24 * 3600
const gen = (x: number) => BigInt(Math.round(x * 1000)) * (GEN / 1000n)
const NOW = Math.floor(Date.now() / 1000)
const ago = (mins: number) => NOW - mins * 60

/** Deterministic pseudo-hash so the same label always renders the same tx. */
function fakeHash(label: string, len = 64): string {
  // Fold the WHOLE label into the seed first, then stream output from it, so
  // labels that differ anywhere produce different hashes.
  let h1 = 0x811c9dc5
  let h2 = 0x1b873593
  for (let k = 0; k < label.length; k++) {
    const c = label.charCodeAt(k)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ (c << 3), 0x85ebca6b) ^ (h1 >>> 13)
  }
  let out = ''
  while (out.length < len) {
    h1 = Math.imul(h1 ^ (h2 >>> 15), 0x2c1b3c6d) >>> 0
    h2 = Math.imul(h2 ^ (h1 >>> 12), 0x297a2d39) >>> 0
    out += ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0')
  }
  return '0x' + out.slice(0, len)
}
const addr = (label: string) => fakeHash(`addr:${label}`, 40)

function trace(no: number, f: Record<string, string | number>): string {
  const q = new URLSearchParams(Object.entries(f).map(([k, v]) => [k, String(v)]))
  return `https://trace.frontrunshield.example/bundle/${no}?${q.toString()}`
}

interface SeqSeed { name: string; bond: number; status: Sequencer['status']; slashed: number; rep: number; pending: number; slashes: number; age: number }
const SEQ_SEEDS: SeqSeed[] = [
  { name: 'Flashbots Alpha Relay', bond: 0.5, status: 'ACTIVE', slashed: 0, rep: 92, pending: 0, slashes: 0, age: 9000 },
  { name: 'Titan Builder #04', bond: 0.2, status: 'SLASHED', slashed: 0.2, rep: 50, pending: 0, slashes: 1, age: 8800 },
  { name: 'BeaverBuild Relay', bond: 0.3, status: 'ACTIVE', slashed: 0, rep: 85, pending: 0, slashes: 0, age: 8700 },
  { name: 'Eden Sequencer', bond: 0.25, status: 'UNDER_REVIEW', slashed: 0, rep: 80, pending: 2, slashes: 0, age: 8600 },
  { name: 'Nebula Sequencer', bond: 1.6, status: 'ACTIVE', slashed: 0, rep: 97, pending: 0, slashes: 0, age: 7400 },
  { name: 'Obsidian Relay', bond: 0.35, status: 'SLASHED', slashed: 0.35, rep: 20, pending: 0, slashes: 2, age: 6100 },
  { name: 'Vertex Builder', bond: 0.9, status: 'UNDER_REVIEW', slashed: 0, rep: 74, pending: 1, slashes: 0, age: 5200 },
  { name: 'Halcyon Relay', bond: 0.75, status: 'ACTIVE', slashed: 0.05, rep: 68, pending: 0, slashes: 1, age: 4000 },
]

const sequencers: Sequencer[] = SEQ_SEEDS.map((s) => ({
  address: addr(s.name),
  name: s.name,
  stakedAmount: gen(s.bond),
  status: s.status,
  totalSlashed: gen(s.slashed),
  reputation: s.rep,
  pendingBundles: s.pending,
  slashCount: s.slashes,
  createdAt: ago(s.age),
  unstakeRequestedAt: 0,
  unstakeAvailableAt: 0,
}))
const seqAddr = (name: string) => sequencers.find((s) => s.name === name)!.address

interface BundleSeed {
  builder: string; pair: string; slip: number; extracted: number; loss: number; gwei: number
  status: Bundle['status']; age: number; victim?: boolean; claimed?: boolean
  t: Record<string, string | number>
}
const BUNDLE_SEEDS: BundleSeed[] = [
  { builder: 'Titan Builder #04', pair: 'WETH/USDC Uniswap V3 0.05%', slip: 495, extracted: 1842000, loss: 1610000, gwei: 412, status: 'TOXIC', age: 1300, victim: true, claimed: false,
    t: { block: 21450112, same_block: 'true', tx_index_frontrun: 41, tx_index_victim: 42, tx_index_backrun: 43, bot_leg1: 'buy WETH same pool same direction as victim', bot_leg2: 'sell WETH same pool immediately after victim', pool_price_before: 3100, pool_price_after_frontrun: 3131.4, victim_exec_price: 3131.02, pool_price_after_backrun: 3100.35, external_ref_price: 3100.1, frontrun_priority_gwei: 412, victim_priority_gwei: 9 } },
  { builder: 'BeaverBuild Relay', pair: 'WETH/USDT Uniswap V3 vs Curve', slip: 6, extracted: 231000, loss: 0, gwei: 38, status: 'BENIGN', age: 1250,
    t: { block: 21450140, same_block: 'false', bot_leg1: 'buy WETH on Uniswap V3 (pool below external price)', bot_leg2: 'sell WETH on Curve (pool above external price)', pool_price_before: 3092.1, pool_price_after: 3099.4, external_ref_price: 3100, frontrun_priority_gwei: 38, victim_priority_gwei: 35 } },
  { builder: 'Eden Sequencer', pair: 'WBTC/USDC Uniswap V3 0.3%', slip: 215, extracted: 612500, loss: 388000, gwei: 140, status: 'PENDING', age: 240,
    t: { block: 21450377, same_block: 'true', tx_index_frontrun: 12, tx_index_victim: 14, tx_index_backrun: 19, pool_price_before: 64210, pool_price_after_frontrun: 64290, victim_exec_price: 64281, pool_price_after_backrun: 64244, external_ref_price: 64238, frontrun_priority_gwei: 140, victim_priority_gwei: 22 } },
  { builder: 'Eden Sequencer', pair: 'PEPE/WETH Uniswap V2', slip: 980, extracted: 4420000, loss: 3910000, gwei: 890, status: 'PENDING', age: 120, victim: true,
    t: { block: 21450502, same_block: 'true', tx_index_frontrun: 3, tx_index_victim: 4, tx_index_backrun: 5, bot_leg1: 'buy PEPE same pool same direction as victim', bot_leg2: 'sell PEPE immediately after victim', pool_price_before: 0.0000182, pool_price_after_frontrun: 0.0000203, victim_exec_price: 0.0000201, pool_price_after_backrun: 0.0000183, external_ref_price: 0.0000181, frontrun_priority_gwei: 890, victim_priority_gwei: 6 } },
  { builder: 'Vertex Builder', pair: 'stETH/WETH Curve', slip: 9, extracted: 96000, loss: 0, gwei: 22, status: 'PENDING', age: 55,
    t: { block: 21450611, same_block: 'false', bot_leg1: 'buy stETH on Curve below peg', bot_leg2: 'redeem/sell stETH on Uniswap', pool_price_before: 0.9962, pool_price_after: 0.9995, external_ref_price: 1.0, frontrun_priority_gwei: 22, victim_priority_gwei: 21 } },
  { builder: 'Obsidian Relay', pair: 'LINK/WETH Sushiswap', slip: 640, extracted: 2210000, loss: 1980000, gwei: 505, status: 'TOXIC', age: 5200, victim: true, claimed: true,
    t: { block: 21391890, same_block: 'true', tx_index_frontrun: 8, tx_index_victim: 9, tx_index_backrun: 10, bot_leg1: 'buy LINK same pool same direction as victim', bot_leg2: 'sell LINK immediately after victim', pool_price_before: 14.02, pool_price_after_frontrun: 14.71, victim_exec_price: 14.68, pool_price_after_backrun: 14.05, external_ref_price: 14.03, frontrun_priority_gwei: 505, victim_priority_gwei: 11 } },
  { builder: 'Obsidian Relay', pair: 'UNI/USDC Uniswap V3 0.3%', slip: 410, extracted: 870000, loss: 790000, gwei: 288, status: 'TOXIC', age: 4100, victim: true, claimed: false,
    t: { block: 21402231, same_block: 'true', tx_index_frontrun: 21, tx_index_victim: 22, tx_index_backrun: 23, bot_leg1: 'buy UNI same pool same direction as victim', bot_leg2: 'sell UNI immediately after victim', pool_price_before: 9.41, pool_price_after_frontrun: 9.79, victim_exec_price: 9.77, pool_price_after_backrun: 9.43, external_ref_price: 9.42, frontrun_priority_gwei: 288, victim_priority_gwei: 8 } },
  { builder: 'Halcyon Relay', pair: 'WETH/DAI Uniswap V3 0.3%', slip: 4, extracted: 41000, loss: 0, gwei: 19, status: 'BENIGN', age: 3000,
    t: { block: 21411500, same_block: 'false', bot_leg1: 'buy WETH on Balancer', bot_leg2: 'sell WETH on Uniswap V3', pool_price_before: 3098.2, pool_price_after: 3100.6, external_ref_price: 3100.9, frontrun_priority_gwei: 19, victim_priority_gwei: 18 } },
  { builder: 'Nebula Sequencer', pair: 'WETH/USDC Uniswap V3 0.05%', slip: 12, extracted: 158000, loss: 0, gwei: 41, status: 'BENIGN', age: 2200,
    t: { block: 21420006, same_block: 'false', bot_leg1: 'buy WETH on Uniswap V3', bot_leg2: 'sell WETH on Sushiswap', pool_price_before: 3095.5, pool_price_after: 3100.1, external_ref_price: 3100.2, frontrun_priority_gwei: 41, victim_priority_gwei: 40 } },
]

const bundles: Bundle[] = BUNDLE_SEEDS.map((b, i) => {
  const id = i + 1
  return {
    id,
    builderAddress: seqAddr(b.builder),
    builderName: b.builder,
    reporter: addr('steward'),
    victimAddress: b.victim ? addr(`victim:${id}`) : '',
    victimTx: fakeHash(`victim:${id}`),
    frontrunTx: fakeHash(`front:${id}`),
    backrunTx: fakeHash(`back:${id}`),
    dexPair: b.pair,
    slippageBps: b.slip,
    extractedCents: b.extracted,
    lossCents: b.loss,
    priorityGwei: b.gwei,
    telemetryUrl: trace(id, b.t),
    reporterBond: GUEST_REPORTER_BOND,
    status: b.status,
    verdictId: 0,
    restitutionClaimed: Boolean(b.claimed),
    createdAt: ago(b.age),
  }
})

const RATIONALE = {
  toxic: (b: Bundle) =>
    `The bot’s frontrun and backrun bracket the victim in the same block with a ${b.priorityGwei} gwei priority fee against the victim’s single-digit tip. The victim was pushed to ${(b.slippageBps / 100).toFixed(2)}% slippage, and the bot’s profit tracks the victim’s loss while the pool price returns to the external reference after the backrun - a textbook sandwich.`,
  benign:
    'The bot’s legs sit on different venues and move each pool toward the external reference price; the victim absorbed negligible price impact and lost nothing. Profit comes from a genuine cross-venue gap, not forced slippage.',
}

const verdicts: Verdict[] = []
for (const b of bundles) {
  if (b.status === 'PENDING') continue
  const toxic = b.status === 'TOXIC'
  const seq = sequencers.find((s) => s.address === b.builderAddress)!
  const slashed = toxic ? (seq.slashCount > 1 ? gen(0.175) : seq.totalSlashed) : 0n
  const v: Verdict = {
    id: verdicts.length + 1,
    bundleId: b.id,
    builderAddress: b.builderAddress,
    consensusState: 'MAJORITY_AGREE',
    isToxic: toxic,
    classification: toxic ? 'TOXIC_SANDWICH' : 'BENIGN_ARBITRAGE',
    confidence: toxic ? 94 : 91,
    rationale: toxic ? RATIONALE.toxic(b) : RATIONALE.benign,
    slashedAmount: slashed,
    reporterBounty: (slashed * BigInt(GUEST_BOUNTY_BPS)) / 10000n,
    reporterBondReturned: toxic,
    timestamp: b.createdAt + 12 * 60,
  }
  b.verdictId = v.id
  verdicts.push(v)
}

export function computeMetrics(seqs: Sequencer[], bs: Bundle[], vs: Verdict[], paid: bigint): Metrics {
  const totalSlashed = seqs.reduce((a, s) => a + s.totalSlashed, 0n)
  const activeBonds = seqs.reduce((a, s) => a + s.stakedAmount, 0n)
  const bounties = vs.reduce((a, v) => a + v.reporterBounty, 0n)
  const forfeited = vs.reduce((a, v) => (v.reporterBondReturned ? a : a + GUEST_REPORTER_BOND), 0n)
  const escrow = bs.filter((b) => b.status === 'PENDING').reduce((a, b) => a + b.reporterBond, 0n)
  const insurancePool = totalSlashed - bounties + forfeited - paid
  const toxicCount = bs.filter((b) => b.status === 'TOXIC').length
  const inconclusiveCount = bs.filter((b) => b.status === 'INCONCLUSIVE').length
  return {
    totalSlashed,
    activeBonds,
    insurancePool,
    restitutionPaid: paid,
    bundlesAnalyzed: vs.length,
    bundlesTotal: bs.length,
    toxicCount,
    benignCount: vs.length - toxicCount - inconclusiveCount,
    inconclusiveCount,
    sequencerCount: seqs.length,
    contractBalance: activeBonds + insurancePool + escrow,
    minBond: gen(0.25),
    reporterBond: GUEST_REPORTER_BOND,
    bountyBps: GUEST_BOUNTY_BPS,
    unstakeCooldown: GUEST_COOLDOWN,
    reporterEscrow: escrow,
    bondsForfeited: forfeited,
    bountiesPaid: bounties,
    solvent: true,
  }
}

export const GUEST_PAID = gen(0.175) // restitution for bundle 6 was already claimed

export function guestSnapshot(): Snapshot {
  // Deep-ish copy so simulated slashes never mutate the seed dataset.
  const seqs = sequencers.map((s) => ({ ...s }))
  const bs = bundles.map((b) => ({ ...b }))
  const vs = verdicts.map((v) => ({ ...v }))
  return { sequencers: seqs, bundles: bs, verdicts: vs, metrics: computeMetrics(seqs, bs, vs, GUEST_PAID) }
}

/** What the simulated validator committee "decides" for each pending bundle. */
const GUEST_TRUTH: Record<number, { toxic: boolean; confidence: number }> = {
  3: { toxic: true, confidence: 83 },
  4: { toxic: true, confidence: 97 },
  5: { toxic: false, confidence: 88 },
}

export interface SimulatedOutcome {
  snapshot: Snapshot
  verdict: Verdict
  votes: string[]
}

/** Apply a committee verdict to a guest snapshot, mirroring the contract's
 *  settlement rules: 50% of the remaining bond is slashed into the insurance
 *  pool (less the reporter's 10% bounty), the builder is marked SLASHED and
 *  reputation moves. A toxic verdict returns the reporter bond; anything else
 *  forfeits it. */
export function simulateEvaluate(prev: Snapshot, bundleId: number): SimulatedOutcome {
  const seqs = prev.sequencers.map((s) => ({ ...s }))
  const bs = prev.bundles.map((b) => ({ ...b }))
  const vs = prev.verdicts.map((v) => ({ ...v }))
  const b = bs.find((x) => x.id === bundleId)!
  const seq = seqs.find((s) => s.address === b.builderAddress)!
  const truth = GUEST_TRUTH[bundleId] ?? { toxic: b.slippageBps >= 50 && b.extractedCents > 0, confidence: 86 }

  let slashed = 0n
  let bounty = 0n
  if (truth.toxic) {
    slashed = (seq.stakedAmount * 5000n) / 10000n
    bounty = (slashed * BigInt(GUEST_BOUNTY_BPS)) / 10000n
    seq.stakedAmount -= slashed
    seq.totalSlashed += slashed
    seq.slashCount += 1
    seq.status = 'SLASHED'
    seq.reputation = Math.max(0, seq.reputation - 30)
    b.status = 'TOXIC'
  } else {
    b.status = 'BENIGN'
    seq.reputation = Math.min(100, seq.reputation + 5)
  }
  seq.pendingBundles = Math.max(0, seq.pendingBundles - 1)
  if (seq.status === 'UNDER_REVIEW' && seq.pendingBundles === 0) seq.status = 'ACTIVE'

  const verdict: Verdict = {
    id: vs.length + 1,
    bundleId,
    builderAddress: b.builderAddress,
    consensusState: 'MAJORITY_AGREE',
    isToxic: truth.toxic,
    classification: truth.toxic ? 'TOXIC_SANDWICH' : 'BENIGN_ARBITRAGE',
    confidence: truth.confidence,
    rationale: truth.toxic ? RATIONALE.toxic(b) : RATIONALE.benign,
    slashedAmount: slashed,
    reporterBounty: bounty,
    reporterBondReturned: truth.toxic,
    timestamp: Math.floor(Date.now() / 1000),
  }
  b.verdictId = verdict.id
  vs.push(verdict)
  const votes = truth.toxic ? ['agree', 'agree', 'agree', 'agree', 'idle'] : ['agree', 'agree', 'agree', 'idle', 'agree']
  return { snapshot: { sequencers: seqs, bundles: bs, verdicts: vs, metrics: computeMetrics(seqs, bs, vs, prev.metrics.restitutionPaid) }, verdict, votes }
}

export function simulateStake(prev: Snapshot, name: string, amount: bigint): Snapshot {
  const seqs = prev.sequencers.map((s) => ({ ...s }))
  seqs.push({
    address: addr(`guest:${name}:${seqs.length}`),
    name,
    stakedAmount: amount,
    status: 'ACTIVE',
    totalSlashed: 0n,
    reputation: 80,
    pendingBundles: 0,
    slashCount: 0,
    createdAt: Math.floor(Date.now() / 1000),
    unstakeRequestedAt: 0,
    unstakeAvailableAt: 0,
  })
  return { ...prev, sequencers: seqs, metrics: computeMetrics(seqs, prev.bundles, prev.verdicts, prev.metrics.restitutionPaid) }
}

export interface BundleReport {
  builderAddress: string
  victimAddress: string
  victimTx: string
  frontrunTx: string
  backrunTx: string
  dexPair: string
  slippageBps: number
  extractedCents: number
  lossCents: number
  priorityGwei: number
}

/** Guest-mode mirror of `submit_mempool_bundle`: escrows the reporter bond. */
export function simulateSubmit(prev: Snapshot, r: BundleReport): Snapshot {
  const seqs = prev.sequencers.map((s) => ({ ...s }))
  const seq = seqs.find((s) => s.address === r.builderAddress)!
  seq.pendingBundles += 1
  if (seq.status === 'ACTIVE') seq.status = 'UNDER_REVIEW'
  const id = prev.bundles.reduce((m, b) => Math.max(m, b.id), 0) + 1
  const bs = [...prev.bundles.map((b) => ({ ...b })), {
    id,
    builderAddress: seq.address,
    builderName: seq.name,
    reporter: addr('you'),
    victimAddress: r.victimAddress,
    victimTx: r.victimTx,
    frontrunTx: r.frontrunTx,
    backrunTx: r.backrunTx,
    dexPair: r.dexPair,
    slippageBps: r.slippageBps,
    extractedCents: r.extractedCents,
    lossCents: r.lossCents,
    priorityGwei: r.priorityGwei,
    telemetryUrl: `https://gateway.frontrunshield.example/trace/${r.victimTx}/${r.frontrunTx}/${r.backrunTx}`,
    reporterBond: GUEST_REPORTER_BOND,
    status: 'PENDING' as const,
    verdictId: 0,
    restitutionClaimed: false,
    createdAt: Math.floor(Date.now() / 1000),
  }]
  return { ...prev, sequencers: seqs, bundles: bs, metrics: computeMetrics(seqs, bs, prev.verdicts, prev.metrics.restitutionPaid) }
}

/** Guest-mode mirror of `request_builder_unstake`. */
export function simulateRequestUnstake(prev: Snapshot, builderAddress: string): Snapshot {
  const seqs = prev.sequencers.map((s) => ({ ...s }))
  const seq = seqs.find((s) => s.address === builderAddress)!
  const now = Math.floor(Date.now() / 1000)
  seq.unstakeRequestedAt = now
  seq.unstakeAvailableAt = now + GUEST_COOLDOWN
  return { ...prev, sequencers: seqs }
}

/** Guest-mode mirror of `finalize_builder_unstake`; throws the contract's revert text. */
export function simulateFinalizeUnstake(prev: Snapshot, builderAddress: string): Snapshot {
  const seqs = prev.sequencers.map((s) => ({ ...s }))
  const seq = seqs.find((s) => s.address === builderAddress)!
  if (seq.unstakeRequestedAt === 0) throw new Error('no unstake requested')
  if (Date.now() / 1000 < seq.unstakeAvailableAt) throw new Error('unstake cooldown not elapsed')
  if (seq.pendingBundles !== 0) throw new Error('pending bundles must be resolved first')
  seq.stakedAmount = 0n
  seq.unstakeRequestedAt = 0
  seq.unstakeAvailableAt = 0
  seq.status = 'EXITED'
  return { ...prev, sequencers: seqs, metrics: computeMetrics(seqs, prev.bundles, prev.verdicts, prev.metrics.restitutionPaid) }
}
