import { chains } from 'genlayer-js'
import deployment from '../../../deployments/studio-next.json'

export const CHAIN_ID = 61997
export const CHAIN_ID_HEX = '0xF22D'
export const NETWORK_NAME = 'Studio Next'
export const RPC_URL: string =
  (import.meta.env.VITE_GENLAYER_RPC_URL as string | undefined) ?? 'https://studio-next.genlayer.com/api'
export const EXPLORER_URL = 'https://explorer-studio-next.genlayer.com'
export const CONTRACT_ADDRESS: string =
  (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) ?? deployment.contract_address
/** Repository link shown in the footer; set VITE_GITHUB_URL at build time. */
export const GITHUB_URL: string | null = (import.meta.env.VITE_GITHUB_URL as string | undefined) ?? null

export const FEE_DEPOSIT_LABEL = '0.1 GEN'
/** Mandatory escrow attached to every bundle report (contract REPORTER_BOND). */
export const REPORTER_BOND_WEI = 50_000_000_000_000_000n
export const REPORTER_BOND_LABEL = '0.05 GEN'

/** genlayer-js ships the consensus-contract wiring for chain 61997; only the
 *  RPC endpoint is pinned here. */
export const genlayerChain = {
  ...chains.studioDevnet,
  rpcUrls: { default: { http: [RPC_URL] } },
} as typeof chains.studioDevnet

export const explorerAddress = (a: string) => `${EXPLORER_URL}/address/${a}`
export const explorerTx = (h: string) => `${EXPLORER_URL}/transactions/${h}`

type SeedEval = { tx?: string; bundle_id?: number; classification?: string }
const seed = (deployment as { seed?: { evaluations?: Record<string, SeedEval> } }).seed

/** The recorded on-chain slashing evaluation, for footer / about links. */
export const recordedSlashTx: string | null =
  Object.values(seed?.evaluations ?? {}).find((e) => e.classification === 'TOXIC_SANDWICH')?.tx ?? null
export const deployTx: string | null = (deployment as { deploy_tx?: string }).deploy_tx ?? null
