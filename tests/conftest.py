"""Shared helpers for FrontrunShield direct-mode tests (pure ASCII).

Direct mode runs the leader closure only; validator agreement is exercised by
calling `direct_vm.run_validator` explicitly in test_consensus.py.
"""

import json

CONTRACT = "contracts/frontrun_shield.py"

GEN = 10**18
MIN_BOND = GEN // 4
BOND = GEN  # 1 GEN

BUILDER_A = "0x" + "a1" * 20
BUILDER_B = "0x" + "b2" * 20
VICTIM = "0x" + "c3" * 20

TX_V = "0x" + "01" * 32
TX_F = "0x" + "02" * 32
TX_B = "0x" + "03" * 32

TELEMETRY = "https://telemetry.frontrunshield.example/bundle/1"
REFERENCE = "https://api.coinbase.com/v2/prices/ETH-USD/spot"


def addr_hex(a) -> str:
    v = getattr(a, "as_hex", None)
    if isinstance(v, str):
        return v.lower()
    if isinstance(a, (bytes, bytearray)):
        return "0x" + bytes(a).hex()
    return str(a).lower()


def fund(vm, who, amount=1_000 * GEN):
    vm.deal(who, amount)


def stake(c, vm, who, name="Flashbots Alpha Relay", builder=BUILDER_A, value=BOND):
    fund(vm, who)
    vm.sender = who
    vm.value = value
    key = c.stake_builder_bond(name, builder)
    vm.value = 0
    return key


def submit(c, vm, who, builder=BUILDER_A, victim=VICTIM, txs=(TX_V, TX_F, TX_B),
           pair="WETH/USDC (Uniswap V3 0.05%)", slippage=480, extracted=1_84200,
           loss=1_61000, gwei=412, url=TELEMETRY):
    vm.sender = who
    vm.value = 0
    return c.submit_mempool_bundle(
        builder, victim, txs[0], txs[1], txs[2], pair, slippage, extracted, loss, gwei, url
    )


def mock_feeds(vm, trace=None, ref=None):
    vm.mock_web(r".*telemetry.*", {"status": 200, "body": json.dumps(trace or {"same_block": True})})
    vm.mock_web(r".*coinbase.*", {"status": 200, "body": json.dumps(ref or {"data": {"amount": "3100.00"}})})


def mock_verdict(vm, cls="TOXIC_SANDWICH", toxic=None, conf=92,
                 rationale="Bot legs bracket the victim in one block; profit tracks victim loss."):
    if toxic is None:
        toxic = cls == "TOXIC_SANDWICH"
    # mock_llm appends and the first match wins, so replace rather than stack.
    vm._llm_mocks.clear()
    vm._llm_mocks_hit.clear()
    payload = {"classification": cls, "is_toxic": toxic, "confidence": conf, "rationale": rationale}
    # Double-encoded: the harness json.loads the mock once, the SDK again.
    vm.mock_llm(r".*", json.dumps(json.dumps(payload)))
