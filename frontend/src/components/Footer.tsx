import { ShieldCheck } from 'lucide-react'
import {
  CHAIN_ID, CONTRACT_ADDRESS, EXPLORER_URL, GITHUB_URL, NETWORK_NAME, RPC_URL, deployTx, explorerAddress, explorerTx,
  recordedSlashTx,
} from '../lib/chain'
import { shortAddr, shortHash } from '../lib/format'

export function Footer() {
  const link = 'text-slate-300 transition hover:text-shield-400'
  return (
    <footer className="mt-16 border-t border-ink-700 bg-ink-900/60">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-6 py-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 whitespace-nowrap text-white">
            <ShieldCheck size={20} className="text-shield-400" />
            <span className="font-bold">FrontrunShield</span>
            <span className="badge border-ink-500 bg-ink-800 normal-case text-slate-300">v1.0-alpha</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Autonomous MEV forensics. A validator committee reads the evidence, decides intent, and slashes toxic sandwich
            builders into a victim insurance pool.
          </p>
        </div>
        <div>
          <h4 className="card-title mb-3">Protocol specs</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li>Network: {NETWORK_NAME} · chain {CHAIN_ID} (0xF22D)</li>
            <li>Minimum bond: 0.25 GEN</li>
            <li>Slash: 50% of remaining bond per toxic verdict</li>
            <li>Consensus: MAJORITY_AGREE over an LLM committee</li>
            <li>Write fee deposit: ~0.1 GEN</li>
            <li className="break-all font-mono text-xs">RPC: {RPC_URL}</li>
          </ul>
        </div>
        <div>
          <h4 className="card-title mb-3">On-chain</h4>
          <ul className="space-y-1.5 text-sm">
            <li><a className={link} href={explorerAddress(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">Contract {shortAddr(CONTRACT_ADDRESS)} ↗</a></li>
            {deployTx && <li><a className={link} href={explorerTx(deployTx)} target="_blank" rel="noreferrer">Deploy tx {shortHash(deployTx)} ↗</a></li>}
            {recordedSlashTx && <li><a className={link} href={explorerTx(recordedSlashTx)} target="_blank" rel="noreferrer">Slashing tx {shortHash(recordedSlashTx)} ↗</a></li>}
            <li><a className={link} href={EXPLORER_URL} target="_blank" rel="noreferrer">Studio Next explorer ↗</a></li>
          </ul>
        </div>
        <div>
          <h4 className="card-title mb-3">Project</h4>
          <ul className="space-y-1.5 text-sm">
            {GITHUB_URL ? (
              <li><a className={link} href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a></li>
            ) : (
              <li className="text-slate-500">GitHub (set VITE_GITHUB_URL)</li>
            )}
            <li><a className={link} href="https://docs.genlayer.com" target="_blank" rel="noreferrer">GenLayer docs ↗</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-700 px-6 py-4">
        <p className="mx-auto max-w-[1400px] text-xs leading-relaxed text-slate-500">
          Disclaimer: FrontrunShield v1.0-alpha is experimental software running on a GenLayer testnet with valueless test
          tokens. Verdicts come from LLM validators and are probabilistic; seeded bundles use synthetic transaction hashes and
          demo telemetry, not real mainnet activity. Nothing here is financial, legal or security advice, and no real funds
          should be bonded.
        </p>
      </div>
    </footer>
  )
}
