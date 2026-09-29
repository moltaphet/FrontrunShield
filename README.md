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
| Contract | [`0x5C5a1d51639C0F9E0bDeb9952907E1F8F6d3433E`](https://explorer-studio-next.genlayer.com/address/0x5C5a1d51639C0F9E0bDeb9952907E1F8F6d3433E) |
| Source verified | On-chain source (`gen_getContractCode`) is byte-identical to `contracts/frontrun_shield.py` (sha256 in `deployments/studio-next.json`) |
| Deploy tx | [`0xf0f36cbe…0cfc`](https://explorer-studio-next.genlayer.com/transactions/0xf0f36cbeaa710a589f24672bcda0ede3bac174cfb1dabe5507a3c4b86cc40cfc) (v2, patched; supersedes `0x1459767AD733f1D14997EF89b2962707c63aE5DE`) |
| **Live slashing tx** | [`0x25cb9e86…e75e`](https://explorer-studio-next.genlayer.com/transactions/0x25cb9e8607f986aa3387b5204e4eac32337ff783974c085af54a8f360325e75e) - `TOXIC_SANDWICH`, confidence 95, builder bond 0.4 → 0.2 GEN, reporter got bond back + 0.02 GEN bounty |
| Live benign tx | [`0x9f6db9cb…d668`](https://explorer-studio-next.genlayer.com/transactions/0x9f6db9cbd6978b0f3968e902da1d70d6cfee888ff6615bd3a551ee6f1856d668) - `BENIGN_ARBITRAGE`, builder cleared, reporter's 0.05 GEN bond forfeited to the pool |
| Restitution claim | [`0x819e91e1…07fe`](https://explorer-studio-next.genlayer.com/transactions/0x819e91e1466ea6be2dfddcdb829dddc2bea88fbe34aa8a79834c0400557707fe) - victim of bundle #1 claimed the 0.18 GEN victim share |

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
  │   │ 1 fetch gateway/<3 tx hashes>  │   │ re-runs steps 1-3       │  ││
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
| `submit_mempool_bundle(...)` | **payable** write | Register a bundle trace against a bonded builder (USD as integer cents). Must carry exactly the 0.05 GEN reporter bond. No telemetry URL parameter. Builder → `UNDER_REVIEW`. |
| `evaluate_bundle_forensics(bundle_id)` | write | Committee consensus, then settlement. |
| `claim_restitution(bundle_id)` | write | Named victim pulls the slashed amount from the pool (CEI, rollback on failed transfer). |
| `set_reference_feed(url)` / `set_telemetry_gateway(url)` | write | Governor-only: independent price feed, and the base URL evidence is fetched from. |
| `request_builder_unstake()` / `finalize_builder_unstake()` | write | Builder exits its own bond: request, 3-day cooldown, release only with `pending_bundles == 0`. |
| `get_all_sequencers` / `get_all_bundles` / `get_all_verdicts` / `get_protocol_metrics` | view | Registry, bundles, verdicts, KPIs (total slashed, active bonds, pool, analyzed). |

**Guardrails.** A deterministic clamp overrides the model: zero extracted value or victim
slippage under 50 bps can never be toxic; confidence under 60 is inconclusive (builder keeps
the bond); contradictory or unparseable model output reverts instead of settling. Telemetry
URLs (governor-set only) are SSRF-guarded, untrusted text is ASCII-sanitised and wrapped in isolation tags.
Slash = 50% of the *remaining* bond, so it can never exceed the stake.

## Economic security model

The first version (`df376dd`) scored 3.5/10 on an economic audit: reporting was free, so anyone
could grief builders at zero cost; reporters chose the evidence URL, so they could serve forged
evidence; a junk report could permanently censor a real one; and builders could withdraw before
a verdict. This version closes each hole.

**Reporter bonding.** `submit_mempool_bundle` must carry exactly `REPORTER_BOND` = 0.05 GEN,
held in `reporter_escrow` until the verdict.

| Verdict | Reporter | Builder | Pool |
|---|---|---|---|
| `TOXIC_SANDWICH` | bond back + **10%** of the slash (bounty) | loses 50% of its bond | slash − bounty (victim share) |
| `BENIGN_ARBITRAGE` | bond **forfeited** | cleared, +reputation | + forfeited bond |
| `INCONCLUSIVE` (incl. no telemetry, low confidence, deterministic clamp) | bond **forfeited** | untouched | + forfeited bond |

**Slashing restitution.** The bounty is carved out of the slash, never extra stake, so
`total_slashed = bounties_paid + victim pool`. `claim_restitution` pays the victim only the
victim share (slash − bounty). Accounting reconciles as
`insurance_pool + restitution_paid + bounties_paid = total_slashed + bonds_forfeited`
(asserted after every test step) and `check_solvency` covers bonds + pool + reporter escrow.

**Deterministic telemetry.** Reporters no longer pass a URL. The evidence endpoint is
`<gateway>/<victim_tx>/<frontrun_tx>/<backrun_tx>`, where the gateway is set by the governor
(`set_telemetry_gateway`, SSRF-guarded) and the hashes are regex-validated. If validators cannot
fetch telemetry the leader returns `INCONCLUSIVE` without asking the model; the contract never
slashes on the reporter's word alone.

**Replay recovery.** The replay guard maps the hash triple to its latest bundle. Only an
`INCONCLUSIVE` bundle may be re-filed (with a fresh bond); `PENDING`, `TOXIC` and `BENIGN` may not.

**Unbonding cooldown.** `request_builder_unstake()` starts a 3-day clock (the bond stays slashable
and reporters can still file). `finalize_builder_unstake()` releases the full remaining bond only
after the cooldown **and** with `pending_bundles == 0`; the state is zeroed before the transfer is
queued and restored if queueing fails. Only the builder's own key can unstake (a sponsor
cannot). An `EXITED` builder can't be reported until it re-stakes.

## Repository layout

```
contracts/frontrun_shield.py     GenVM intelligent contract
tests/                           92 direct-mode tests (staking, consensus branches, slashing limits,
                                 restitution / re-entrancy, validator equivalence, reporter bonding,
                                 deterministic telemetry, replay recovery, builder unbonding)
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
.venv/bin/python -m pytest tests -q                     # 92 passed
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
| `pytest tests` | 92 passed |
| `genvm-lint check` | passed |
| `npm run lint` / `npm run build` | 0 errors (tsc strict + vite) |
| `npm run check:headless` | 30/30: zero console errors on live load, all tabs, navbar single-line at 1280/1440/1920 px, wrong-network alert + switch, guest slashing flow, unstake cooldown, report form deposit notice / no telemetry input |
| Live consensus | toxic → slashed, benign → cleared, restitution claimed (hashes above) |

## Honest limitations

* **Seeded data is synthetic.** Tx hashes are keccak labels, not mainnet transactions. The demo
  telemetry gateway is httpbin's echo endpoint: it proves the derived URL is reachable but carries
  no trace content, so the live verdicts lean on the reporter-supplied numbers (slippage, profit,
  loss, tip) plus the Coinbase reference price. Production must point the governor-set gateway at an
  independent indexer/RPC trace service.
* **Reporter-supplied numbers remain reporter-supplied.** A lying report is costly (bond forfeited)
  but a report crafted to earn a *benign* verdict on a real attack would block re-filing.
* **Unbonding is untested live end to end**: the seeded builders are synthetic keys nobody holds
  and the cooldown is 3 days; it is covered by direct-mode tests with a warped clock.
* **Governor is a single key** (gateway and reference feed).
* **Validators are LLMs**: verdicts are probabilistic. Guardrails bound the damage, not the error rate.
  Live votes showed 3 `agree` + 2 `idle` per round.
* Seed victim of bundle #1 is the deployer, so the restitution path could be exercised; that claim
  already drained the pool, so the live escrow KPI reads 0 with 0.2 GEN paid.
* Builders are bonded via sponsorship (the deployer funded four synthetic builder addresses).
  There is no bond-withdrawal path yet, and only 50%-of-remaining slashing (no appeals UI).
* Altering the contract requires a redeploy (new address); rerun `deploy.py --force`.
* Test-network software with valueless tokens - not audited, not for real funds.
