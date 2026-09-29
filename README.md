# FrontrunShield

**Autonomous MEV forensics & sequencer slashing on GenLayer Studio Next (chain 61997).**

Block builders post a GEN bond. Anyone can submit a suspect transaction bundle
(bot frontrun → victim swap → bot backrun). A committee of GenVM validators reads the
evidence, decides whether it was a **toxic sandwich** or a **benign arbitrage**, and
reaches `MAJORITY_AGREE` consensus. A toxic verdict slashes the builder's bond into a
victim insurance pool, from which the victim can claim restitution.

| | |
|---|---|
| Network | GenLayer Studio Next · chain `61997` (`0xF22D`) · RPC `https://studio-next.genlayer.com/api` |
| Contract | [`0x1459767AD733f1D14997EF89b2962707c63aE5DE`](https://explorer-studio-next.genlayer.com/address/0x1459767AD733f1D14997EF89b2962707c63aE5DE) |
| Source verified | On-chain source (`gen_getContractCode`) is byte-identical to `contracts/frontrun_shield.py` (sha256 in `deployments/studio-next.json`) |
| Deploy tx | [`0x85ea4d9f…07fd`](https://explorer-studio-next.genlayer.com/transactions/0x85ea4d9f3a09637fabcf5eebb8f381802c2ae971599bf9218bef4bcd9f1707fd) |
| **Live slashing tx** | [`0x546230fd…e2f0`](https://explorer-studio-next.genlayer.com/transactions/0x546230fd33682b7b49351bdde84e2dceb295cdcef75f89cb5635a25407bfe2f0) - `TOXIC_SANDWICH`, confidence 95, 3 validators `agree`, builder bond 0.4 → 0.2 GEN |
| Live benign tx | [`0xeece0008…1887`](https://explorer-studio-next.genlayer.com/transactions/0xeece000888722668152bedfb310c8a6411df3bfcf1b17b049fd0aee6226e1887) - `BENIGN_ARBITRAGE`, builder cleared, no slash |
| Restitution claim | [`0x7e31e4ee…ada3`](https://explorer-studio-next.genlayer.com/transactions/0x7e31e4eef7a4babcad05e8175584c5a92841423ea14aecf7ebe8c87b4848ada3) - victim of bundle #1 claimed the 0.2 GEN |

## Why a smart contract can't do this (theory)

MEV extraction on Ethereum has cumulatively passed the $1B mark by public trackers'
estimates. Every sandwich is visible in public block data, yet victims have no
recourse. The evidence isn't missing; the *judgement* is. Whether an ordering was an
attack depends on intent:

* A bot that trades a pool **toward** an external price is arbitrage. A bot that trades
  **just before** a retail swap to push it to its slippage limit, then unwinds **just after**,
  is extracting value from that victim. The transactions can look structurally alike.
* The EVM is deterministic and sealed. It can only branch on on-chain data and rules
  written in advance; it cannot fetch a reference price or a trace, and any fixed heuristic
  becomes a spec for attackers to engineer around while catching honest arbitrageurs.
* Moving the verdict to a multisig or a single oracle just recreates a trusted referee.

GenLayer intelligent contracts can read the web *and* reason over it, and validators reach
consensus on **judgement** via the Equivalence Principle instead of byte-identical output.

## Architecture

```
  builder / relay                    reporter (anyone)                 victim
        │ stake_builder_bond              │ submit_mempool_bundle           │
        ▼                                 ▼                                 │
  ┌────────────────────────────  FrontrunShield (GenVM)  ─────────────────┐│
  │ sequencers  bundles  verdicts  insurance_pool   total_bonded          ││
  │                                                                       ││
  │ evaluate_bundle_forensics(bundle_id)                                  ││
  │   ┌───────────── leader ─────────────┐   ┌──── each validator ─────┐  ││
  │   │ 1 fetch trace telemetry_url      │   │ re-runs steps 1-3       │  ││
  │   │ 2 fetch Coinbase reference price │   │ agrees iff              │  ││
  │   │ 3 LLM forensic prompt -> verdict │──▶│   is_toxic  ==  leader  │  ││
  │   │ 4 deterministic clamp            │   │   |Δconfidence| <= 35   │  ││
  │   └──────────────────────────────────┘   └─────────────────────────┘  ││
  │        MAJORITY_AGREE ─▶ toxic? slash 50% of bond ─▶ insurance_pool   ││
  │                          benign? clear builder, +reputation           ││
  │ claim_restitution(bundle_id) ◀────────────────────────────────────────┘│
  └────────────────────────────────────────────────────────────────────────┘
        ▲ reads (gen_call)                     ▲ writes (+0.1 GEN fee deposit)
        └──────────────  Vite + React dashboard  ──────────────┘
```

### Contract (`contracts/frontrun_shield.py`)

State: `Sequencer` (name, bond, `ACTIVE | UNDER_REVIEW | SLASHED`, total slashed,
reputation), `Bundle` (builder, victim/frontrun/backrun tx hashes, DEX pair, victim
slippage bps, extracted USD, telemetry URL…), `Verdict` (consensus state, `is_toxic`,
rationale, slashed amount, timestamp), plus the insurance pool.

| Method | Kind | Purpose |
|---|---|---|
| `stake_builder_bond(name, builder_hex)` | payable write | Post / top up collateral. `builder_hex` empty = caller; a relay may sponsor a bond for a builder key. Min 0.25 GEN. |
| `submit_mempool_bundle(...)` | write | Register a bundle trace against a bonded builder (USD as integer cents). Builder → `UNDER_REVIEW`. |
| `evaluate_bundle_forensics(bundle_id)` | write | Committee consensus, then settlement. |
| `claim_restitution(bundle_id)` | write | Named victim pulls the slashed amount from the pool (CEI, rollback on failed transfer). |
| `set_reference_feed(url)` | write | Governor-only independent price feed. |
| `get_all_sequencers` / `get_all_bundles` / `get_all_verdicts` / `get_protocol_metrics` | view | Registry, bundles, verdicts, KPIs (total slashed, active bonds, pool, analyzed). |

**Guardrails.** A deterministic clamp overrides the model: zero extracted value or victim
slippage under 50 bps can never be toxic; confidence under 60 is inconclusive (builder keeps
the bond); contradictory or unparseable model output reverts instead of settling. Telemetry
URLs are SSRF-guarded, untrusted text is ASCII-sanitised and wrapped in isolation tags.
Slash = 50% of the *remaining* bond, so it can never exceed the stake.

## Repository layout

```
contracts/frontrun_shield.py     GenVM intelligent contract
tests/                           57 direct-mode tests (staking, consensus branches, slashing limits,
                                 restitution / re-entrancy, validator equivalence)
scripts/deploy.py                key + faucet + deploy + on-chain source verification
scripts/interact_live.py         seed | evaluate | claim | status | all
deployments/studio-next.json     address, tx hashes, verification, seeded state
frontend/                        Vite + React + Tailwind + lucide + genlayer-js dashboard
frontend/src/data/guestData.ts   rich mock dataset for Guest Mode
```

## Run it

```bash
# Python (3.12; pins mirror the working GenLayer toolchain)
uv venv --python 3.12 && uv pip install --python .venv/bin/python --prerelease=allow -r requirements.txt
.venv/bin/python -m pytest tests -q                     # 57 passed
.venv/bin/genvm-lint check contracts/frontrun_shield.py

# Deploy + seed (generates a git-ignored, mode-600 .env with a fresh key; funds it via sim_fundAccount)
.venv/bin/python scripts/deploy.py
.venv/bin/python scripts/interact_live.py all           # 4 builders, 3 bundles, evaluates toxic + benign

# Frontend
cd frontend && npm install
npm run lint && npm run build
npm run dev                                             # http://localhost:5173
npm run preview -- --port 4173 & npm run check:headless # zero-console-error live check (needs Chrome)
```

Every write attaches the Studio Next fee deposit (~0.1 GEN, from the live fee policy);
without it the chain reverts `FeesDistributionMissing`. Optional build env:
`VITE_CONTRACT_ADDRESS`, `VITE_GENLAYER_RPC_URL`, `VITE_GITHUB_URL` (footer link).

## Steward evaluation guide

1. **Guest Mode** (navbar toggle): no wallet needed. On *Terminal*, pick a **PENDING** bundle,
   study the flow `[Bot Frontrun] → [Victim: Max Slippage Hit] → [Bot Backrun]`, the price path
   and priority-fee ratio, then press **Evaluate Bundle Forensics** and watch the 3-step stepper
   end in a slashing verdict. The *Sequencer Registry* and KPI banner update.
2. **Live Contract**: the same UI reading the deployed contract. Bundle **#3** (Eden Sequencer,
   WBTC/USDC) is left `PENDING` for you. Connect MetaMask; on any other chain a sticky red bar
   offers one-click **Switch to Studio Next (61997)**. Evaluate prompts with the 0.1 GEN fee deposit
   and settles on-chain in ~30-45 s.
3. **Sequencer Bonds**: post a bond (min 0.25 GEN); **Architecture / About** explains the design.
4. Cross-check on the explorer: the slashing tx above shows the validator votes; the contract's
   source matches the repo byte for byte.

## Verification status

| Check | Result |
|---|---|
| `pytest tests` | 57 passed |
| `genvm-lint check` | passed |
| `npm run lint` / `npm run build` | 0 errors (tsc strict + vite) |
| `npm run check:headless` | 26/26: zero console errors on live load, all tabs, navbar single-line at 1280/1440/1920 px, wrong-network alert + switch, guest slashing flow |
| Live consensus | toxic → slashed, benign → cleared, restitution claimed (hashes above) |

## Honest limitations

* **Seeded data is synthetic.** Tx hashes are keccak labels, not mainnet transactions. Telemetry
  is served by an httpbin echo endpoint reflecting the trace encoded in the URL, so it is the
  *reporter's* data; production should point `telemetry_url` at an independent indexer/RPC trace
  service. The only genuinely independent feed today is the Coinbase reference price.
* **Validators are LLMs**: verdicts are probabilistic. Guardrails bound the damage, not the error rate.
  Live votes showed 3 `agree` + 2 `idle` per round.
* Seed victim of bundle #1 is the deployer, so the restitution path could be exercised; that claim
  already drained the pool, so the live escrow KPI reads 0 with 0.2 GEN paid.
* Builders are bonded via sponsorship (the deployer funded four synthetic builder addresses).
  There is no bond-withdrawal path yet, and only 50%-of-remaining slashing (no appeals UI).
* Altering the contract requires a redeploy (new address); rerun `deploy.py --force`.
* Test-network software with valueless tokens - not audited, not for real funds.
