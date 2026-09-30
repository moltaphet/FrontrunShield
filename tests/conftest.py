"""Shared helpers for FrontrunShield direct-mode tests (pure ASCII).

Direct mode runs the leader closure only; validator agreement is exercised by
calling `direct_vm.run_validator` explicitly in test_consensus.py.
"""

import json

CONTRACT = "contracts/frontrun_shield.py"

GEN = 10**18
MIN_BOND = GEN // 4
BOND = GEN  # 1 GEN
REPORTER_BOND = GEN // 20  # 0.05 GEN, mandatory with every bundle report
BOUNTY_BPS = 1000
COOLDOWN = 3 * 24 * 3600
RESTITUTION_WINDOW = 90 * 24 * 3600

BUILDER_A = "0x" + "a1" * 20
BUILDER_B = "0x" + "b2" * 20
VICTIM = "0x" + "c3" * 20

TX_V = "0x" + "01" * 32
TX_F = "0x" + "02" * 32
TX_B = "0x" + "03" * 32

GATEWAY = "https://telemetry.frontrunshield.example/api/v2"
BOT = "0x" + "d4" * 20  # the sandwich bot's address in the fixture traces
BLOCK = 21_450_112
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


def deploy_configured(vm, deploy):
    """Deploy and point the telemetry gateway; the deploy-time sender is the
    governor and is remembered as `vm.deployer`."""
    c = deploy(CONTRACT)
    vm.deployer = vm.sender
    c.set_telemetry_gateway(GATEWAY)
    return c


def record_transfers(vm):
    """Capture every native transfer the contract queues (returns the list)."""
    seen = []

    def hook(_vm, request):
        seen.append(request)
        return None

    vm._gl_call_hook = hook
    return seen


def stake(c, vm, who, name="Flashbots Alpha Relay", builder=BUILDER_A, value=BOND):
    fund(vm, who)
    vm.sender = who
    vm.value = value
    key = c.stake_builder_bond(name, builder)
    vm.value = 0
    return key


def submit(c, vm, who, builder=BUILDER_A, victim=VICTIM, txs=(TX_V, TX_F, TX_B),
           pair="WETH/USDC (Uniswap V3 0.05%)", slippage=480, extracted=1_84200,
           loss=1_61000, gwei=412, value=REPORTER_BOND):
    fund(vm, who)
    vm.sender = who
    vm.value = value
    # Remember what this reporter claimed so mock_trace can serve receipts that
    # honestly back it (a forged-claim test passes `truth=` explicitly instead).
    if not hasattr(vm, "_claims"):
        vm._claims = {}
    vm._claims[tuple(txs)] = {"slippage": slippage, "extracted": extracted, "loss": loss, "gwei": gwei}
    try:
        return c.submit_mempool_bundle(
            builder, victim, txs[0], txs[1], txs[2], pair, slippage, extracted, loss, gwei
        )
    finally:
        vm.value = 0


def triple(n):
    """Distinct tx-hash triples so several bundles can coexist."""
    return tuple("0x" + (f"{n:02x}" + f"{0xa0 + i:02x}") * 16 for i in range(3))


def tx_record(tx_hash, sender, position, block=BLOCK, **extra):
    """A structured transaction record in the Blockscout shape."""
    rec = {"hash": tx_hash, "from": {"hash": sender}, "to": {"hash": "0x" + "e5" * 20},
           "block_number": block, "position": position, "status": "ok",
           "gas_price": 30 * 10**9, "method": "swapExactTokensForTokens"}
    rec.update(extra)
    return rec


_UNSET = object()

POOL = "0x" + "f1" * 20
USDC = {"address": "0x" + "a0" * 20, "symbol": "USDC", "decimals": "6", "exchange_rate": "1.00"}
WETH = {"address": "0x" + "a1" * 20, "symbol": "WETH", "decimals": "18", "exchange_rate": "3100.00"}
DEFAULT_TRUTH = {"slippage": 480, "extracted": 1_84200, "loss": 1_61000, "gwei": 412}


def _xfer(frm, to, token, cents):
    """One Blockscout token-transfer item worth `cents` USD at the token's rate."""
    dec = int(token["decimals"])
    if token is USDC:
        value = cents * 10 ** (dec - 2)
    else:
        value = cents * 10 ** dec // 310_000  # WETH at $3100.00
    return {"from": {"hash": frm}, "to": {"hash": to}, "token": dict(token),
            "total": {"value": str(value), "decimals": token["decimals"]}}


def receipts(truth, victim=VICTIM, bot=BOT):
    """Token-transfer logs whose *derived* economics equal `truth`
    (slippage bps, bot profit cents, victim loss cents)."""
    loss, slip = truth["loss"], truth["slippage"]
    usd_in = loss * 10_000 // slip if loss > 0 and slip > 0 else 10_000_00
    usd_out = usd_in - loss
    park = 50_000_00  # bot working capital, cents
    return {
        "victim": [_xfer(victim, POOL, USDC, usd_in), _xfer(POOL, victim, WETH, usd_out)],
        "frontrun": [_xfer(bot, POOL, USDC, park), _xfer(POOL, bot, WETH, park)],
        "backrun": [_xfer(bot, POOL, WETH, park), _xfer(POOL, bot, USDC, park + truth["extracted"])],
    }


def mock_trace(vm, txs=(TX_V, TX_F, TX_B), victim_sender=VICTIM, bot=BOT, block=BLOCK,
               miner=BUILDER_A, block_data=_UNSET, truth=None, logs=_UNSET, **overrides):
    """Serve a genuine-looking sandwich for one triple (frontrun -> victim ->
    backrun) plus its block. `overrides` maps role (victim/frontrun/backrun) ->
    dict of field overrides, or None to make that tx a 404. `miner` is the
    block's builder; `block_data` replaces the whole block payload (None = 404).
    Token-transfer receipts are generated from `truth` (default: whatever the
    last submit() for this triple claimed); `logs` maps role -> raw payload
    (None = 404) to replace them."""
    if truth is None:
        truth = getattr(vm, "_claims", {}).get(tuple(txs), DEFAULT_TRUTH)
    rcpt = receipts(truth, victim=victim_sender, bot=bot)
    roles = (("victim", txs[0], victim_sender, 42), ("frontrun", txs[1], bot, 41), ("backrun", txs[2], bot, 43))
    for role, h, sender, pos in roles:
        ov = overrides.get(role, {})
        if ov is None:
            vm.mock_web(rf".*telemetry.*/transactions/{h}$", {"status": 404, "body": "not found"})
            continue
        rec = tx_record(h, sender, pos, block=block)
        if role == "frontrun":
            rec.update(gas_price=(truth["gwei"] + 38) * 10**9, base_fee_per_gas=38 * 10**9)
        rec.update(ov)
        raw = (logs.get(role, _UNSET) if isinstance(logs, dict) else _UNSET)
        url = rf".*telemetry.*/transactions/{h}/token-transfers$"
        if raw is None:
            vm.mock_web(url, {"status": 404, "body": "not found"})
        else:
            payload = {"items": rcpt[role], "next_page_params": None} if raw is _UNSET else raw
            vm.mock_web(url, {"status": 200, "body": json.dumps(payload)})
        vm.mock_web(rf".*telemetry.*/transactions/{h}$", {"status": 200, "body": json.dumps(rec)})
    if block_data is None:
        vm.mock_web(rf".*telemetry.*/blocks/{block}$", {"status": 404, "body": "not found"})
    else:
        body = {"height": block, "miner": {"hash": miner}} if block_data is _UNSET else block_data
        vm.mock_web(rf".*telemetry.*/blocks/{block}$", {"status": 200, "body": json.dumps(body)})


def mock_feeds(vm, victim=VICTIM, ref=None, miner=BUILDER_A, miners=None, truth=None):
    """Valid telemetry for the default triple and triple(1..20) (each in its own
    block BLOCK+n so miners can differ: `miners` maps n -> builder), plus the
    reference price feed."""
    mock_trace(vm, (TX_V, TX_F, TX_B), victim_sender=victim, miner=miner, truth=truth)
    for n in range(1, 21):
        mock_trace(vm, triple(n), victim_sender=victim, block=BLOCK + n, miner=(miners or {}).get(n, miner),
                   truth=truth)
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
