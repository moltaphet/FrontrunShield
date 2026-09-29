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
| Contract | [`0xE247dCb27BBC57b6F05849a104DaB0e8cEfb3eA2`](https://explorer-studio-next.genlayer.com/address/0xE247dCb27BBC57b6F05849a104DaB0e8cEfb3eA2) |
| Source verified | On-chain source (`gen_getContractCode`) is byte-identical to `contracts/frontrun_shield.py` (sha256 in `deployments/studio-next.json`) |
| Deploy tx | [`0xacab6500…888b`](https://explorer-studio-next.genlayer.com/transactions/0xacab6500598f2bb989c30c7447f91aa3559b3f89e8666530dae6c528dbee888b) (v3; supersedes `0x1459767AD733f1D14997EF89b2962707c63aE5DE`, `0x5C5a1d51639C0F9E0bDeb9952907E1F8F6d3433E`) |
| **Live slashing tx** | [`0x94bed37c…5d0e`](https://explorer-studio-next.genlayer.com/transactions/0x94bed37c4056b739a829bd7d2699d277839c35b1c503bfe0b1156c4762cb5d0e) - real mainnet triple passed strict verification, `TOXIC_SANDWICH` (confidence 95), builder bond 0.4 → 0.2 GEN, reporter got bond + 0.02 GEN bounty |
| Live audit-PoC tx | [`0xe67b3f52…67f5`](https://explorer-studio-next.genlayer.com/transactions/0xe67b3f521438b2ae09e4b90fb87c8b699905ff63551b23500463cb4488f567f5) - fabricated hashes, `INCONCLUSIVE` ("Telemetry rejected"), zero slash, reporter bond refunded |

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

The first version (`df376dd`) scored 3.5/10 on an economic audit. The follow-up (`3ded865`)
added reporter bonds but the demo gateway was an httpbin echo that answers HTTP 200 to anything,
so fabricated hashes could still reach the model and slash an honest builder. Security is now
layered; every layer is enforced on-chain and covered by tests.

**1. Reporter bond.** `submit_mempool_bundle` must carry exactly `REPORTER_BOND` = 0.05 GEN,
escrowed until the verdict.

| Outcome | Reporter | Builder | Pool |
|---|---|---|---|
| `TOXIC_SANDWICH` | bond back + **10%** of the slash | loses 50% of its bond | slash − bounty (victim share) |
| `BENIGN_ARBITRAGE` (explicit ruling) | bond **forfeited** | cleared, +reputation | + forfeited bond |
| `INCONCLUSIVE` (unverifiable evidence, gateway outage, model shrug, deterministic clamp) | bond **refunded** | untouched | unchanged |

Only a committee ruling that the accusation was wrong costs the reporter anything.

**2. Strict telemetry verification (no blind trust in HTTP 200).** Reporters cannot name a URL.
Each tx is read from `<governor gateway>/<tx_hash>` and must be a structured transaction record:
* the record's **own `hash` field** equals the requested hash (an echo of the request URL, `{}`,
  HTML, a list, or a hash merely mentioned in text is rejected), with a sender, block and position;
* all three in **one block**, ordered **frontrun < victim < backrun**, frontrun and backrun from
  the **same sender**, victim not the bot, no failed txs;
* the **claimed victim must equal the victim tx's sender** (skipped only when no victim is named,
  which also means nobody can claim restitution).

Any failure returns `INCONCLUSIVE` before the model is called, so a compromised or echo gateway
cannot be talked into a slash. The prompt receives only the extracted, sanitised facts and
instructs validators to return INCONCLUSIVE for echoes or fabricated traces. The deployed
gateway is Blockscout's transaction API, which answers 404 for unknown hashes.

**3. Slashing restitution.** The bounty is carved out of the slash, never extra stake.
`insurance_pool + restitution_paid + bounties_paid + surplus_allocated = total_slashed +
bonds_forfeited` (asserted after every test step); `check_solvency` covers bonds + pool + escrow.

**4. The pool is never permanently locked.** A named victim has `RESTITUTION_WINDOW` = 90 days to
claim; that share is *reserved*. Everything else in the pool (forfeited bonds, shares with no named
victim, lapsed shares) is *surplus* the governor can pay out with `allocate_insurance_surplus`,
capped at `allocatable_surplus`, so it cannot touch claimable restitution.

**5. Replay recovery.** Only an `INCONCLUSIVE` bundle may be re-filed (fresh bond).

**6. Unbonding cooldown.** `request_builder_unstake()` starts a 3-day clock (the bond stays
slashable, reporters can still file). `finalize_builder_unstake()` releases the bond only after the
cooldown **and** with `pending_bundles == 0`, CEI with rollback. Only the builder's own key can act.

## Repository layout

```
contracts/frontrun_shield.py     GenVM intelligent contract
tests/                           114 direct-mode tests (staking, consensus branches, slashing limits,
                                 restitution / re-entrancy, validator equivalence, reporter bonding,
                                 strict telemetry verification incl. the audit PoC, victim binding, bond
                                 refund, insurance surplus, replay recovery, builder unbonding)
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
.venv/bin/python -m pytest tests -q                     # 114 passed
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
| `pytest tests` | 114 passed |
| `genvm-lint check` | passed |
| `npm run lint` / `npm run build` | 0 errors (tsc strict + vite) |
| `npm run check:headless` | 30/30: zero console errors on live load, all tabs, navbar single-line at 1280/1440/1920 px, wrong-network alert + switch, guest slashing flow, unstake cooldown, report form deposit notice / no telemetry input |
| Live consensus | toxic → slashed, benign → cleared, restitution claimed (hashes above) |

## Honest limitations

* **Live evidence.** Bundle #1 uses a real Ethereum mainnet triple (block 26084998), so it
  passes strict verification against Blockscout, but its slippage / profit / loss numbers are
  illustrative reporter claims, and the tx endpoint carries no price-impact data: the verdict
  rests on structure, fee ordering and those claims plus the Coinbase reference price.
  Bundles #2 and #3 use fabricated hashes on purpose (the audit PoC). Real production use needs
  a gateway with receipts / token transfers.
* **Refunds make junk reports free** (gas / fee deposit aside): an unverifiable report locks the
  builder's `pending_bundles` until someone calls evaluate. That was the trade-off chosen for fair
  outage handling.
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
