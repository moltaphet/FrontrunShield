"""Shared plumbing for the deploy / interact scripts.

Everything here targets GenLayer Studio Next (chain 61997). Nothing prints or
logs the private key.
"""

from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import time
from pathlib import Path

from eth_account import Account
from eth_account.signers.local import LocalAccount
from eth_utils import keccak
from genlayer_py import create_client
from genlayer_py.chains import studio_devnet

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
CONTRACT_PATH = ROOT / "contracts" / "frontrun_shield.py"
DEPLOYMENT_PATH = ROOT / "deployments" / "studio-next.json"

CHAIN_ID = 61997
DEFAULT_RPC = "https://studio-next.genlayer.com/api"
EXPLORER = "https://explorer-studio-next.genlayer.com"
GEN = 10**18
FUND_AMOUNT = 10 * GEN
MIN_WORKING_BALANCE = 3 * GEN  # top up below this

WAIT_INTERVAL_MS = 3000
WAIT_RETRIES = 200  # ~10 minutes


def log(msg: str = "") -> None:
    print(msg, flush=True)


# ------------------------------------------------------------------ .env / key
def _read_env() -> dict:
    env: dict = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def load_or_create_account() -> LocalAccount:
    """Return the deployer account, generating a key into a git-ignored,
    mode-600 .env on first run."""
    env = _read_env()
    key = env.get("DEPLOYER_PRIVATE_KEY", "")
    if not key:
        acct = Account.create()
        lines = [f"DEPLOYER_PRIVATE_KEY={acct.key.hex()}"]
        if "GENLAYER_RPC_URL" not in env:
            lines.append(f"GENLAYER_RPC_URL={DEFAULT_RPC}")
        existing = ENV_PATH.read_text().rstrip("\n") + "\n" if ENV_PATH.exists() else ""
        ENV_PATH.write_text(existing + "\n".join(lines) + "\n")
        log(f"Generated a new deployer key -> {ENV_PATH.name} (git-ignored)")
    os.chmod(ENV_PATH, stat.S_IRUSR | stat.S_IWUSR)  # 600
    key = _read_env()["DEPLOYER_PRIVATE_KEY"]
    return Account.from_key(key if key.startswith("0x") else "0x" + key)


def rpc_url() -> str:
    return _read_env().get("GENLAYER_RPC_URL") or os.environ.get("GENLAYER_RPC_URL") or DEFAULT_RPC


def make_client(account: LocalAccount | None = None):
    last: Exception | None = None
    for attempt in range(6):  # ride out transient DNS / connection blips
        try:
            client = create_client(chain=studio_devnet, endpoint=rpc_url(), account=account)
            chain_id = client.w3.eth.chain_id
            break
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(5 * (attempt + 1))
    else:
        sys.exit(f"RPC unreachable after retries: {last}")
    if chain_id != CHAIN_ID:
        sys.exit(f"Connected to chain {chain_id}, expected {CHAIN_ID}")
    return client


# ------------------------------------------------------------------- balances
def balance(client, address: str) -> int:
    return client.w3.eth.get_balance(address)


def fmt_gen(wei: int) -> str:
    return f"{wei / GEN:.4f} GEN"


def ensure_funded(client, address: str, minimum: int = MIN_WORKING_BALANCE) -> int:
    """Top the account up with 10 GEN via Studio's sim_fundAccount faucet when
    it falls below `minimum`."""
    bal = balance(client, address)
    log(f"Balance: {fmt_gen(bal)}")
    if bal < minimum:
        log(f"Below {fmt_gen(minimum)} - requesting {fmt_gen(FUND_AMOUNT)} via sim_fundAccount ...")
        client.fund_account(address, FUND_AMOUNT)
        for _ in range(20):
            bal = balance(client, address)
            if bal >= minimum:
                break
            time.sleep(1)
        log(f"Balance: {fmt_gen(bal)}")
    return bal


# --------------------------------------------------------------- transactions
def fee_options(client):
    """Studio Next requires a fee deposit on every transaction (~0.1 GEN); an
    absent `fees` argument resolves to zero and reverts FeesDistributionMissing.
    The estimate is derived from the chain's live fee policy."""
    return client.estimate_transaction_fees()


def _status_of(receipt) -> str:
    """Consensus outcome, e.g. MAJORITY_AGREE (Studio) plus lifecycle state."""
    life = receipt.get("lifecycle") or {}
    name = receipt.get("result_name") or receipt.get("statusName") or receipt.get("status_name")
    parts = [str(name)] if name else []
    if isinstance(life, dict) and life.get("outcome"):
        parts.append(str(life["outcome"]))
    return "/".join(parts) or str(receipt.get("status"))


def _execution_result(receipt) -> str:
    """VM outcome of the call itself. A transaction can be ACCEPTED by
    consensus while the contract call reverted (FINISHED_WITH_ERROR)."""
    return str(receipt.get("txExecutionResultName") or receipt.get("tx_execution_result_name") or "")


def _failed(receipt) -> bool:
    res = _execution_result(receipt).upper()
    if res:
        return "ERROR" in res
    return str(receipt.get("txExecutionResult", "1")) not in ("1", "")


def wait_decided(client, tx_hash):
    return client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        wait_until="decided",
        interval=WAIT_INTERVAL_MS,
        retries=WAIT_RETRIES,
        full_transaction=False,
    )


def send_write(client, account, address, method, args=None, value=0, label=None):
    """Send a state-changing call with the mandatory fee deposit, wait for the
    consensus decision and raise if the contract call reverted. Returns
    (tx_hash_hex, receipt)."""
    label = label or method
    fees = fee_options(client)
    t0 = time.time()
    tx = client.write_contract(
        address=address,
        function_name=method,
        account=account,
        args=args or [],
        value=value,
        fees=fees,
    )
    tx_hex = tx if isinstance(tx, str) else tx.hex()
    if not tx_hex.startswith("0x"):
        tx_hex = "0x" + tx_hex
    log(f"  -> {label}: {tx_hex}")
    receipt = wait_decided(client, tx_hex)
    status, result = _status_of(receipt), _execution_result(receipt)
    log(f"     {status} / {result or 'n/a'} in {time.time() - t0:.0f}s")
    if _failed(receipt) or "UNDETERMINED" in status.upper() or "DISAGREE" in status.upper():
        raise RuntimeError(f"{label} failed: status={status} result={result}\n{json.dumps(receipt, default=str)[:1500]}")
    return tx_hex, receipt


def decode_code(blob: str) -> bytes:
    """gen_getContractCode returns the source base64-encoded."""
    import base64
    try:
        return base64.b64decode(blob, validate=True)
    except Exception:
        raw = blob[2:] if blob.startswith("0x") else blob
        try:
            return bytes.fromhex(raw)
        except ValueError:
            return blob.encode()


def verify_source(client, address: str) -> bool | None:
    """Byte-for-byte comparison of the deployed source with the local file."""
    try:
        res = client.provider.make_request(method="gen_getContractCode", params=[address])
    except Exception:
        return None
    blob = res.get("result")
    if not blob:
        return None
    return decode_code(blob).strip() == CONTRACT_PATH.read_bytes().strip()


def read(client, account, address, method, args=None):
    return client.read_contract(address=address, function_name=method, args=args or [], account=account)


# ----------------------------------------------------------------- deployment
def load_deployment() -> dict:
    return json.loads(DEPLOYMENT_PATH.read_text()) if DEPLOYMENT_PATH.exists() else {}


def save_deployment(data: dict) -> None:
    DEPLOYMENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEPLOYMENT_PATH.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n")


def source_sha256() -> str:
    return hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()


def synthetic_address(label: str) -> str:
    """Deterministic 20-byte address for a seeded builder (no key is held for
    it - bonds are sponsored by the deployer)."""
    return "0x" + keccak(text=f"frontrunshield:builder:{label}")[-20:].hex()


def synthetic_hash(label: str) -> str:
    return "0x" + keccak(text=f"frontrunshield:tx:{label}").hex()


def tx_link(h: str) -> str:
    return f"{EXPLORER}/transactions/{h}"


def address_link(a: str) -> str:
    return f"{EXPLORER}/address/{a}"
