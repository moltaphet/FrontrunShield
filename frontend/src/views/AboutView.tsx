import { ArrowDown, Ban, BrainCircuit, CheckCircle2, Scale } from 'lucide-react'
import type { ReactNode } from 'react'
import { CONTRACT_ADDRESS, deployTx, explorerAddress, explorerTx, recordedSlashTx } from '../lib/chain'
import { shortAddr, shortHash } from '../lib/format'

function Box({ title, children, tone = 'border-ink-600' }: { title: string; children: ReactNode; tone?: string }) {
  return (
    <div className={`rounded-xl border ${tone} bg-ink-850/70 p-3.5`}>
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-slate-400">{children}</div>
    </div>
  )
}

export function AboutView() {
  const link = 'font-semibold text-cyanx-400 hover:underline'
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="card-title">Architecture / About</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Why Solidity fails - and what GenLayer changes</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
          MEV extraction on Ethereum has cumulatively passed the $1B mark by public trackers’ estimates, and the retail traders
          paying it have no recourse. The reason is not a lack of evidence - every sandwich is sitting in public block data. It is that
          <em> deciding whether an ordering was an attack </em> is a judgement about intent, and smart contracts cannot make judgements.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card border-toxic-600/40 p-5">
          <div className="flex items-center gap-2 text-toxic-400"><Ban size={18} /><h2 className="text-base font-bold">The EVM dilemma</h2></div>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">
            <li><b className="text-white">Determinism is a wall.</b> Every EVM node must compute the identical result, so a contract can only branch on data already on-chain and on rules a programmer wrote in advance.</li>
            <li><b className="text-white">No off-chain context.</b> Whether a bot swap moved a pool <i>toward</i> an external price (arbitrage) or <i>away from</i> a retail victim’s limit (sandwich) needs a reference price, a trace and the surrounding block. A contract cannot fetch any of it.</li>
            <li><b className="text-white">Rules get gamed.</b> Any fixed heuristic - “same block, same pool, profit &gt; X” - is a specification an attacker engineers around, while honest arbitrageurs get caught by it.</li>
            <li><b className="text-white">Oracles just move the trust.</b> Handing the verdict to a multisig or a single API recreates the centralised referee MEV protocols were meant to replace.</li>
          </ul>
        </div>
        <div className="card border-shield-600/40 p-5">
          <div className="flex items-center gap-2 text-shield-400"><BrainCircuit size={18} /><h2 className="text-base font-bold">The GenLayer answer</h2></div>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">
            <li><b className="text-white">Contracts that can read the web.</b> The intelligent contract itself fetches the bundle trace and an independent price feed inside the transaction.</li>
            <li><b className="text-white">Contracts that can reason.</b> Each validator runs an LLM over the evidence with an explicit definition of sandwich vs arbitrage, and returns a verdict, a confidence and a written rationale.</li>
            <li><b className="text-white">Consensus on judgement, not bytes.</b> Under the Equivalence Principle validators need not produce identical text: they must agree on the verdict flag and land within a confidence band. One rogue leader cannot slash anyone.</li>
            <li><b className="text-white">Settlement is native.</b> The same transaction that reaches consensus moves the money: the bond is cut and the insurance pool is credited.</li>
          </ul>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2"><Scale size={18} className="text-cyanx-400" /><h2 className="text-base font-bold text-white">Pipeline of one evaluation</h2></div>
        <div className="mt-4 grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] ">
          <Box title="1 · Ingest" tone="border-cyanx-500/50">Leader and validators each fetch the bundle telemetry and a Coinbase reference price, sanitised and isolated inside untrusted tags so trace data can never act as instructions.</Box>
          <ArrowDown className="mx-auto self-center text-slate-500 md:-rotate-90" size={18} />
          <Box title="2 · Committee verdict" tone="border-amberx-500/50">The leader’s LLM verdict is re-derived by every validator. They agree only if <code className="text-slate-300">is_toxic</code> matches and confidence differs by ≤ 35 points.</Box>
          <ArrowDown className="mx-auto self-center text-slate-500 md:-rotate-90" size={18} />
          <Box title="3 · Settle" tone="border-toxic-600/50">Toxic (and ≥ 60% confident, with real extraction and harm): 50% of the builder’s bond moves to the insurance pool. Anything else clears the builder.</Box>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-shield-400" /><h2 className="text-base font-bold text-white">Guardrails</h2></div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300">
            <li>Deterministic clamp: no extracted value, or victim slippage under 0.5%, can never be toxic - whatever the model says.</li>
            <li>Confidence below 60 is treated as inconclusive: the builder keeps the bond.</li>
            <li>Self-contradicting or unparseable model output reverts the round instead of settling.</li>
            <li>SSRF-guarded telemetry URLs; untrusted text is ASCII-sanitised and tag-isolated.</li>
            <li>Pull-pattern restitution with checks-effects-interactions and a rollback if the transfer cannot be queued.</li>
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-base font-bold text-white">On-chain record</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li>Contract <a className={link} href={explorerAddress(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">{shortAddr(CONTRACT_ADDRESS)} ↗</a></li>
            {deployTx && <li>Deployment <a className={link} href={explorerTx(deployTx)} target="_blank" rel="noreferrer">{shortHash(deployTx)} ↗</a></li>}
            {recordedSlashTx && <li>Consensus slashing <a className={link} href={explorerTx(recordedSlashTx)} target="_blank" rel="noreferrer">{shortHash(recordedSlashTx)} ↗</a></li>}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Seeded bundles use synthetic transaction hashes and an echo endpoint for telemetry: they demonstrate the mechanism, not
            real mainnet events. Production would point <code>telemetry_url</code> at an indexer-backed trace service.
          </p>
        </div>
      </section>
    </div>
  )
}
