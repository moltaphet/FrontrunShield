import { createClient } from 'genlayer-js'
import { CONTRACT_ADDRESS, CHAIN_ID, CHAIN_ID_HEX, RPC_URL, NETWORK_NAME, genlayerChain, EXPLORER_URL } from './chain'
import type { Bundle, Metrics, Sequencer, SequencerStatus, Snapshot, Verdict, BundleStatus } from './types'

// ---------------------------------------------------------------- wallet ----
export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, cb: (...a: unknown[]) => void): void
  removeListener?(event: string, cb: (...a: unknown[]) => void): void
}

export const getProvider = (): Eip1193 | null =>
  typeof window === 'undefined' ? null : ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null)

export async function currentChainId(p: Eip1193): Promise<number> {
  return parseInt((await p.request({ method: 'eth_chainId' })) as string, 16)
}

export async function connectAccount(p: Eip1193): Promise<string | null> {
  const accts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
  return accts?.[0] ?? null
}

export async function existingAccount(p: Eip1193): Promise<string | null> {
  const accts = (await p.request({ method: 'eth_accounts' })) as string[]
  return accts?.[0] ?? null
}

/** One-click network switch, adding Studio Next to the wallet if unknown. */
export async function switchToStudioNext(p: Eip1193): Promise<void> {
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] })
  } catch (err) {
    const code = (err as { code?: number }).code
    if (code === 4902 || code === -32603) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: `GenLayer ${NETWORK_NAME}`,
            nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
      })
    } else {
      throw err
    }
  }
}

// ----------------------------------------------------------- normalisation ---
/** genlayer-js decodes contract dicts to Map (and ints to bigint | number). */
function plain(v: unknown): unknown {
  if (v instanceof Map) {
    const o: Record<string, unknown> = {}
    v.forEach((val, key) => {
      o[String(key)] = plain(val)
    })
    return o
  }
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) o[k] = plain(val)
    return o
  }
  return v
}

const n = (v: unknown): number => Number(v ?? 0)
const big = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? '0'))
  } catch {
    return 0n
  }
}
const s = (v: unknown): string => (v == null ? '' : String(v))
type Row = Record<string, unknown>

export const toSequencer = (r: Row): Sequencer => ({
  address: s(r.sequencer_address),
  name: s(r.name),
  stakedAmount: big(r.staked_amount),
  status: s(r.status) as SequencerStatus,
  totalSlashed: big(r.total_slashed),
  reputation: n(r.reputation_score),
  pendingBundles: n(r.pending_bundles),
  slashCount: n(r.slash_count),
  createdAt: n(r.created_at),
})

export const toBundle = (r: Row): Bundle => ({
  id: n(r.bundle_id),
  builderAddress: s(r.builder_address),
  builderName: s(r.builder_name),
  reporter: s(r.reporter),
  victimAddress: s(r.victim_address),
  victimTx: s(r.victim_tx_hash),
  frontrunTx: s(r.frontrun_tx_hash),
  backrunTx: s(r.backrun_tx_hash),
  dexPair: s(r.dex_pair),
  slippageBps: n(r.victim_slippage_bps),
  extractedCents: n(r.bot_extracted_value_usd_cents),
  lossCents: n(r.victim_loss_usd_cents),
  priorityGwei: n(r.frontrun_priority_gwei),
  telemetryUrl: s(r.telemetry_url),
  status: s(r.status) as BundleStatus,
  verdictId: n(r.verdict_id),
  restitutionClaimed: Boolean(r.restitution_claimed),
  createdAt: n(r.created_at),
})

export const toVerdict = (r: Row): Verdict => ({
  id: n(r.verdict_id),
  bundleId: n(r.bundle_id),
  builderAddress: s(r.builder_address),
  consensusState: s(r.consensus_state),
  isToxic: Boolean(r.is_toxic),
  classification: s(r.classification),
  confidence: n(r.confidence),
  rationale: s(r.forensic_rationale),
  slashedAmount: big(r.slashed_amount),
  timestamp: n(r.timestamp),
})

export const toMetrics = (r: Row): Metrics => ({
  totalSlashed: big(r.total_slashed),
  activeBonds: big(r.active_bonds),
  insurancePool: big(r.insurance_pool),
  restitutionPaid: big(r.restitution_paid),
  bundlesAnalyzed: n(r.bundles_analyzed),
  bundlesTotal: n(r.bundles_total),
  toxicCount: n(r.toxic_count),
  benignCount: n(r.benign_count),
  sequencerCount: n(r.sequencer_count),
  contractBalance: big(r.contract_balance),
  minBond: big(r.min_bond),
  solvent: Boolean(r.solvent),
})

// ------------------------------------------------------------------ reads ----
type ReadClient = { readContract: (a: Record<string, unknown>) => Promise<unknown> }
let reader: ReadClient | null = null

function readClient(): ReadClient {
  // A read needs no signer: gen_call answers for an account-less client, so the
  // dashboard renders live state before any wallet connects.
  reader ??= createClient({ chain: genlayerChain }) as unknown as ReadClient
  return reader
}

async function view(functionName: string, args: unknown[] = []): Promise<unknown> {
  return plain(await readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args }))
}

export async function readSnapshot(): Promise<Snapshot> {
  const [metrics, sequencers, bundles, verdicts] = await Promise.all([
    view('get_protocol_metrics'),
    view('get_all_sequencers'),
    view('get_all_bundles'),
    view('get_all_verdicts'),
  ])
  return {
    metrics: toMetrics(metrics as Row),
    sequencers: (sequencers as Row[]).map(toSequencer),
    bundles: (bundles as Row[]).map(toBundle),
    verdicts: (verdicts as Row[]).map(toVerdict),
  }
}

// ----------------------------------------------------------------- writes ----
export interface WriteProgress {
  onFeeQuote?: (feeWei: bigint) => void
  onSubmitted?: (hash: string) => void
}

type WalletClient = {
  writeContract: (a: Record<string, unknown>) => Promise<string>
  estimateTransactionFees: () => Promise<{ feeValue: bigint }>
  waitForTransactionReceipt: (a: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export interface WriteResult {
  hash: string
  receipt: Record<string, unknown>
  votes: string[]
}

/** Send a write through the injected wallet with the mandatory Studio Next fee
 *  deposit attached (the chain reverts FeesDistributionMissing without it), and
 *  wait for the consensus decision. */
export async function writeContract(
  account: string,
  functionName: string,
  args: unknown[],
  value: bigint,
  progress: WriteProgress = {},
): Promise<WriteResult> {
  const provider = getProvider()
  if (!provider) throw new Error('No injected wallet detected.')
  const client = createClient({ chain: genlayerChain, account: account as `0x${string}`, provider }) as unknown as WalletClient
  const fees = await client.estimateTransactionFees()
  progress.onFeeQuote?.(fees.feeValue)
  const hash = await client.writeContract({ address: CONTRACT_ADDRESS, functionName, args, value, fees })
  progress.onSubmitted?.(hash)
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: 'decided', interval: 3000, retries: 200 })
  const execName = String(receipt.txExecutionResultName ?? '')
  if (execName.includes('ERROR')) throw new Error(`Contract call reverted (${execName}).`)
  const votes = Object.values(((receipt.consensus_data as Row | undefined)?.votes as Row | undefined) ?? {}).map(String)
  return { hash, receipt, votes }
}

export { CHAIN_ID }
