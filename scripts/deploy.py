"""Deploy contracts/frontrun_shield.py to GenLayer Studio Next (chain 61997).

    .venv/bin/python scripts/deploy.py            # deploy (skips if already deployed)
    .venv/bin/python scripts/deploy.py --force    # redeploy a fresh instance

Handles the deployer key (generated into a git-ignored, mode-600 .env), tops the
account up from Studio's sim_fundAccount faucet, deploys with the mandatory fee
deposit attached, checks the on-chain code against the local source, and records
everything in deployments/studio-next.json.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *  # noqa: E402,F403
from common import (  # noqa: E402
    CONTRACT_PATH, DEPLOYMENT_PATH, CHAIN_ID, EXPLORER, address_link, tx_link,
    ensure_funded, fee_options, fmt_gen, load_deployment, load_or_create_account,
    log, make_client, rpc_url, save_deployment, source_sha256, wait_decided,
    _status_of, _execution_result, _failed, verify_source,
)

RUNNER = "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng"


def extract_address(receipt) -> str | None:
    for path in (
        ("data", "contract_address"),
        ("txDataDecoded", "contractAddress"),
        ("tx_data_decoded", "contract_address"),
        ("to_address",),
        ("contract_address",),
        ("contractAddress",),
    ):
        cur = receipt
        for k in path:
            cur = cur.get(k) if isinstance(cur, dict) else None
        if isinstance(cur, str) and cur.startswith("0x") and int(cur, 16) != 0:
            return cur
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-only", action="store_true", help="re-check the recorded contract's source and exit")
    ap.add_argument("--force", action="store_true", help="deploy a new instance even if one is recorded")
    args = ap.parse_args()

    existing = load_deployment()
    if args.verify_only:
        client = make_client(load_or_create_account())
        ok = verify_source(client, existing["contract_address"])
        existing["verification"] = {
            "method": "gen_getContractCode (base64) compared byte-for-byte with the local source",
            "onchain_source_matches": ok,
            "local_source_sha256": source_sha256(),
            "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        }
        save_deployment(existing)
        log(f"On-chain source matches local source: {ok}")
        return
    if existing.get("contract_address") and not args.force:
        log(f"Already deployed at {existing['contract_address']} (use --force to redeploy).")
        log(address_link(existing["contract_address"]))
        return

    account = load_or_create_account()
    client = make_client(account)
    log(f"Network : Studio Next (chain {CHAIN_ID}) @ {rpc_url()}")
    log(f"Deployer: {account.address}")
    ensure_funded(client, account.address)

    fees = fee_options(client)
    log(f"Fee deposit attached: {fmt_gen(fees['fee_value'])}")

    code = CONTRACT_PATH.read_bytes()
    log("Deploying contracts/frontrun_shield.py ...")
    tx = client.deploy_contract(code=code, account=account, args=[], fees=fees)
    tx_hex = tx if isinstance(tx, str) else tx.hex()
    tx_hex = tx_hex if tx_hex.startswith("0x") else "0x" + tx_hex
    log(f"  -> deploy tx: {tx_hex}")
    receipt = wait_decided(client, tx_hex)
    status, result = _status_of(receipt), _execution_result(receipt)
    log(f"     {status} / {result or 'n/a'}")

    address = extract_address(receipt)
    if not address:
        sys.exit(f"Deployment decided but no contract address in receipt:\n{receipt}")
    if _failed(receipt):
        sys.exit(f"Deployment reverted: {receipt}")
    log(f"Contract: {address}")

    verified = verify_source(client, address)
    log(f"On-chain source matches local source: {verified}")

    save_deployment({
        "network": "studio-next",
        "chain_id": CHAIN_ID,
        "rpc_url": rpc_url(),
        "explorer": EXPLORER,
        "contract_address": address,
        "explorer_url": address_link(address),
        "deployer": account.address,
        "deploy_tx": tx_hex,
        "deploy_tx_url": tx_link(tx_hex),
        "deployed_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "contracts/frontrun_shield.py",
        "source_sha256": source_sha256(),
        "runner": RUNNER,
        "fee_deposit_per_write_wei": str(fees["fee_value"]),
        "verification": {
            "method": "gen_getContractCode (base64) compared byte-for-byte with the local source",
            "onchain_source_matches": verified,
            "local_source_sha256": source_sha256(),
            "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        },
        "seed": {},
    })
    log(f"Recorded -> {DEPLOYMENT_PATH.relative_to(DEPLOYMENT_PATH.parent.parent)}")
    log(address_link(address))
    log("Next: .venv/bin/python scripts/interact_live.py seed")


if __name__ == "__main__":
    main()
