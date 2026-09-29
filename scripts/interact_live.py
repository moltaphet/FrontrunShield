"""Seed and drive the live FrontrunShield deployment on Studio Next.

    .venv/bin/python scripts/interact_live.py seed        # gateway, feed, builders, bonds, 3 bundles (0.05 GEN reporter bond each)
    .venv/bin/python scripts/interact_live.py evaluate 1  # run consensus forensics on bundle 1
    .venv/bin/python scripts/interact_live.py claim 1     # victim claims restitution (deployer is the victim of bundle 1)
    .venv/bin/python scripts/interact_live.py status      # dump metrics, builders, bundles, verdicts
    .venv/bin/python scripts/interact_live.py all         # seed + evaluate the real toxic bundle and the fabricated one

Every write carries the ~0.1 GEN Studio Next fee deposit (see common.send_write).
`seed` is idempotent: it reads on-chain state first and only sends what is missing.

Every bundle report escrows the mandatory 0.05 GEN reporter bond (returned plus a
10% bounty on a toxic verdict, refunded when INCONCLUSIVE, forfeited only on an
explicit BENIGN ruling). Reporters cannot name a
telemetry URL: the contract derives each as `<gateway>/<tx_hash>`
from the governor-set gateway, which `seed` configures.

Telemetry: the gateway is Blockscout's transaction API, which answers 404 for unknown
hashes. Bundle #1 uses a real mainnet triple (so it passes strict verification); #2 and
#3 use fabricated hashes (the audit PoC) and resolve INCONCLUSIVE with a refunded bond.
The slippage / profit / loss figures on bundle #1 are illustrative reporter claims.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    GEN, address_link, ensure_funded, fmt_gen, load_deployment, load_or_create_account,
    log, make_client, read, save_deployment, send_write, synthetic_address,
    synthetic_hash, tx_link, balance,
)

REFERENCE_FEED = "https://api.coinbase.com/v2/prices/ETH-USD/spot"
TELEMETRY_GATEWAY = "https://eth.blockscout.com/api/v2/transactions"  # 404s unknown txs
REPORTER_BOND = GEN // 20  # 0.05 GEN, must accompany every submit_mempool_bundle

BUILDERS = [
    # name, bond (GEN)
    ("Flashbots Alpha Relay", 0.50),
    ("Titan Builder #04", 0.40),
    ("BeaverBuild Relay", 0.30),
    ("Eden Sequencer", 0.25),
]


# A real bracketed swap on Ethereum mainnet (block 26084998, positions 242 / 243 / 245):
# one sender calls the same aggregator immediately before and after another
# sender's swap. Whether it is a *sandwich* is exactly what the committee decides;
# the slippage / profit / loss numbers below are ILLUSTRATIVE reporter claims,
# not measured values.
REAL = {
    "victim": "0x44d09b1f74233d59d377444461784e862b593d8da080e5eef8c8adc860e6eb67",
    "frontrun": "0xa7dc6893a00ec5a279297ed3381a2fe0d260410f87e328c27a54b54b857b478f",
    "backrun": "0x93bea253871cd7439c99129d657e8fea1f8782e6e3e704314c6443ad806dbd61",
    "victim_address": "0xce9f4e0fd41078d903286deebe3f3bc81e38d247",
}


def bundles_spec(_deployer: str) -> list[dict]:
    return [
        {  # 1 - real mainnet triple: passes strict telemetry verification
            "key": "toxic-sandwich",
            "builder": "Titan Builder #04",
            "victim": REAL["victim_address"],
            "hashes": (REAL["victim"], REAL["frontrun"], REAL["backrun"]),
            "pair": "Aggregator swap (mainnet block 26084998)",
            "slippage_bps": 150,
            "extracted_cents": 250_000,
            "loss_cents": 180_000,
            "priority_gwei": 30,
        },
        {  # 2 - the auditor's PoC shape: fabricated hashes. The gateway 404s them, so
           # the round is INCONCLUSIVE, nothing is slashed and the bond is refunded.
            "key": "fabricated-hashes",
            "builder": "BeaverBuild Relay",
            "victim": "",
            "pair": "WETH/USDT Uniswap V3 vs Curve",
            "slippage_bps": 6,
            "extracted_cents": 231_000,
            "loss_cents": 0,
            "priority_gwei": 38,
        },
        {  # 3 - fabricated and left PENDING for a steward to evaluate from the UI
            "key": "pending-review",
            "builder": "Eden Sequencer",
            "victim": "",
            "pair": "WBTC/USDC Uniswap V3 0.3%",
            "slippage_bps": 215,
            "extracted_cents": 612_500,
            "loss_cents": 388_000,
            "priority_gwei": 140,
        },
    ]


def ctx():
    dep = load_deployment()
    if not dep.get("contract_address"):
        sys.exit("No deployment recorded - run scripts/deploy.py first.")
    account = load_or_create_account()
    client = make_client(account)
    return dep, account, client, dep["contract_address"]


def seed_record(dep: dict) -> dict:
    return dep.setdefault("seed", {})


def do_seed() -> None:
    dep, account, client, addr = ctx()
    ensure_funded(client, account.address)
    rec = seed_record(dep)
    rec.setdefault("builders", {})
    rec.setdefault("bundles", {})
    rec.setdefault("evaluations", {})

    # -- independent reference price feed (governor-only) ------------------------
    if read(client, account, addr, "get_reference_feed") != REFERENCE_FEED:
        log("Setting the independent reference price feed ...")
        h, _ = send_write(client, account, addr, "set_reference_feed", [REFERENCE_FEED],
                          label="set_reference_feed")
        rec["reference_feed"] = {"url": REFERENCE_FEED, "tx": h, "tx_url": tx_link(h)}
        save_deployment(dep)

    # -- governor-verified telemetry gateway ----------------------------------------
    if read(client, account, addr, "get_telemetry_gateway") != TELEMETRY_GATEWAY:
        log("Setting the telemetry gateway ...")
        h, _ = send_write(client, account, addr, "set_telemetry_gateway", [TELEMETRY_GATEWAY],
                          label="set_telemetry_gateway")
        rec["telemetry_gateway"] = {"url": TELEMETRY_GATEWAY, "tx": h, "tx_url": tx_link(h)}
        save_deployment(dep)

    # -- builders + bonds -----------------------------------------------------------
    have = {s["sequencer_address"]: s for s in read(client, account, addr, "get_all_sequencers")}
    for name, bond in BUILDERS:
        key = synthetic_address(name)
        if key in have:
            log(f"Builder exists: {name} ({key})")
            rec["builders"].setdefault(name, {"address": key})
            continue
        log(f"Staking {bond} GEN bond for {name} ({key}) ...")
        h, _ = send_write(client, account, addr, "stake_builder_bond", [name, key],
                          value=int(bond * GEN), label=f"stake_builder_bond[{name}]")
        rec["builders"][name] = {"address": key, "bond_gen": bond, "tx": h, "tx_url": tx_link(h)}
        save_deployment(dep)

    # -- bundles ---------------------------------------------------------------------
    existing = {b["victim_tx_hash"]: b for b in read(client, account, addr, "get_all_bundles")}
    for spec in bundles_spec(account.address.lower()):
        v, f, b = spec.get("hashes") or (
            synthetic_hash(f"{spec['key']}:{k}") for k in ("victim", "frontrun", "backrun"))
        if v in existing:
            bid = existing[v]["bundle_id"]
            log(f"Bundle exists: #{bid} {spec['key']}")
            rec["bundles"].setdefault(spec["key"], {"bundle_id": bid})
            continue
        builder_key = synthetic_address(spec["builder"])
        log(f"Submitting bundle '{spec['key']}' against {spec['builder']} "
            f"(reporter bond {fmt_gen(REPORTER_BOND)}) ...")
        h, _ = send_write(
            client, account, addr, "submit_mempool_bundle",
            [builder_key, spec["victim"], v, f, b, spec["pair"], spec["slippage_bps"],
             spec["extracted_cents"], spec["loss_cents"], spec["priority_gwei"]],
            value=REPORTER_BOND,
            label=f"submit_mempool_bundle[{spec['key']}]",
        )
        bundles = read(client, account, addr, "get_all_bundles")
        bid = next(x["bundle_id"] for x in bundles if x["victim_tx_hash"] == v)
        rec["bundles"][spec["key"]] = {
            "bundle_id": bid, "builder": spec["builder"], "victim_tx_hash": v,
            "frontrun_tx_hash": f, "backrun_tx_hash": b, "tx": h, "tx_url": tx_link(h),
        }
        save_deployment(dep)
    log("Seed complete.")


def bundle_id_for(dep: dict, ref: str) -> int:
    if ref.isdigit():
        return int(ref)
    return int(dep["seed"]["bundles"][ref]["bundle_id"])


def do_evaluate(ref: str) -> None:
    dep, account, client, addr = ctx()
    ensure_funded(client, account.address)
    bid = bundle_id_for(dep, ref)
    before = read(client, account, addr, "get_bundle", [bid])
    if before["status"] != "PENDING":
        log(f"Bundle #{bid} already evaluated: {before['status']}")
        return
    log(f"Evaluating bundle #{bid} ({before['dex_pair']}, builder {before['builder_name']}) via validator consensus ...")
    seq_before = read(client, account, addr, "get_sequencer", [before["builder_address"]])
    h, receipt = send_write(client, account, addr, "evaluate_bundle_forensics", [bid],
                            label=f"evaluate_bundle_forensics[#{bid}]")
    after = read(client, account, addr, "get_bundle", [bid])
    verdicts = read(client, account, addr, "get_all_verdicts")
    verdict = next(v for v in verdicts if v["bundle_id"] == bid)
    seq_after = read(client, account, addr, "get_sequencer", [before["builder_address"]])
    votes = (receipt.get("consensus_data") or {}).get("votes") or {}
    log(f"  verdict     : {verdict['classification']} (toxic={verdict['is_toxic']}, confidence {verdict['confidence']})")
    log(f"  consensus   : {verdict['consensus_state']}  votes={list(votes.values())}")
    log(f"  slashed     : {fmt_gen(int(verdict['slashed_amount']))}")
    log(f"  reporter    : bond {'returned' if verdict.get('reporter_bond_returned') else 'forfeited'}, "
        f"bounty {fmt_gen(int(verdict.get('reporter_bounty', 0)))}")
    log(f"  builder     : {seq_before['status']} {fmt_gen(int(seq_before['staked_amount']))} -> "
        f"{seq_after['status']} {fmt_gen(int(seq_after['staked_amount']))}")
    log(f"  rationale   : {verdict['forensic_rationale']}")
    log(f"  explorer    : {tx_link(h)}")
    rec = seed_record(dep)
    rec.setdefault("evaluations", {})[str(bid)] = {
        "bundle_id": bid,
        "bundle_status": after["status"],
        "classification": verdict["classification"],
        "is_toxic": verdict["is_toxic"],
        "confidence": verdict["confidence"],
        "consensus_state": verdict["consensus_state"],
        "validator_votes": list(votes.values()),
        "slashed_amount_wei": verdict["slashed_amount"],
        "reporter_bounty_wei": verdict.get("reporter_bounty", "0"),
        "reporter_bond_returned": verdict.get("reporter_bond_returned"),
        "builder": before["builder_name"],
        "builder_status_after": seq_after["status"],
        "rationale": verdict["forensic_rationale"],
        "tx": h,
        "tx_url": tx_link(h),
        "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    save_deployment(dep)


def do_claim(ref: str) -> None:
    dep, account, client, addr = ctx()
    bid = bundle_id_for(dep, ref)
    h, _ = send_write(client, account, addr, "claim_restitution", [bid], label=f"claim_restitution[#{bid}]")
    rec = seed_record(dep)
    rec.setdefault("restitution_claims", {})[str(bid)] = {"tx": h, "tx_url": tx_link(h)}
    save_deployment(dep)
    log(f"Restitution claimed: {tx_link(h)}")


def do_status() -> None:
    dep, account, client, addr = ctx()
    log(f"Contract {addr}\n{address_link(addr)}")
    log(f"Deployer balance: {fmt_gen(balance(client, account.address))}")
    log(json.dumps(read(client, account, addr, "get_protocol_metrics"), indent=2))
    for s in read(client, account, addr, "get_all_sequencers"):
        unbond = f"  unbonding until {s['unstake_available_at']}" if s.get("unstake_available_at") else ""
        log(f"  builder {s['name']:<24} {s['status']:<13} bond {fmt_gen(int(s['staked_amount']))}  slashed {fmt_gen(int(s['total_slashed']))}  rep {s['reputation_score']}{unbond}")
    for b in read(client, account, addr, "get_all_bundles"):
        log(f"  bundle #{b['bundle_id']} {b['status']:<8} {b['dex_pair']:<32} builder={b['builder_name']}")
    for v in read(client, account, addr, "get_all_verdicts"):
        log(f"  verdict #{v['verdict_id']} bundle {v['bundle_id']} {v['classification']} conf={v['confidence']} slashed={fmt_gen(int(v['slashed_amount']))}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed")
    sub.add_parser("status")
    sub.add_parser("all")
    for name in ("evaluate", "claim"):
        p = sub.add_parser(name)
        p.add_argument("bundle", help="bundle id or seed key (toxic-sandwich | fabricated-hashes | pending-review)")
    args = ap.parse_args()
    if args.cmd == "seed":
        do_seed()
    elif args.cmd == "evaluate":
        do_evaluate(args.bundle)
    elif args.cmd == "claim":
        do_claim(args.bundle)
    elif args.cmd == "status":
        do_status()
    elif args.cmd == "all":
        do_seed()
        do_evaluate("toxic-sandwich")
        do_evaluate("fabricated-hashes")
        do_status()


if __name__ == "__main__":
    main()
