"""Validator-side equivalence: the committee agrees on the verdict flag and a
confidence band, and refuses to endorse anything it cannot reproduce."""

import pytest

from conftest import CONTRACT, BOND, stake, submit, mock_feeds, mock_verdict


@pytest.fixture
def run(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = direct_deploy(CONTRACT)
    stake(c, direct_vm, direct_alice)
    bid = submit(c, direct_vm, direct_bob)
    mock_feeds(direct_vm)
    mock_verdict(direct_vm, "TOXIC_SANDWICH", conf=90)
    direct_vm.sender = direct_bob
    c.evaluate_bundle_forensics(bid)
    return direct_vm


def test_validator_agrees_with_identical_verdict(run):
    assert run.run_validator() is True


def test_validator_tolerates_confidence_drift(run):
    mock_verdict(run, "TOXIC_SANDWICH", conf=70)  # |90-70| = 20 <= 35
    assert run.run_validator() is True


def test_validator_rejects_confidence_outside_band(run):
    mock_verdict(run, "TOXIC_SANDWICH", conf=60)  # |90-60| = 30 -> ok
    assert run.run_validator() is True
    mock_verdict(run, "TOXIC_SANDWICH", conf=99)
    assert run.run_validator(leader_result={
        "is_toxic": True, "confidence": 61, "classification": "TOXIC_SANDWICH", "rationale": "x"}) is False


def test_validator_rejects_opposite_verdict(run):
    mock_verdict(run, "BENIGN_ARBITRAGE", conf=90)
    assert run.run_validator() is False


def test_validator_rejects_forged_leader_claiming_toxic(run):
    """A malicious leader asserts TOXIC; honest validators see benign."""
    mock_verdict(run, "BENIGN_ARBITRAGE", conf=95)
    forged = {"is_toxic": True, "confidence": 99, "classification": "TOXIC_SANDWICH",
              "rationale": "trust me"}
    assert run.run_validator(leader_result=forged) is False


def test_validator_rejects_malformed_leader_payload(run):
    assert run.run_validator(leader_result="toxic") is False
    assert run.run_validator(leader_result={"is_toxic": True}) is False
    assert run.run_validator(leader_result={
        "is_toxic": True, "confidence": 90, "classification": "TOXIC_SANDWICH", "rationale": "  "}) is False


def test_validator_does_not_endorse_when_it_cannot_reproduce(run):
    run._llm_mocks.clear()
    run.mock_llm(r".*", '"garbage"')
    assert run.run_validator() is False


def test_validator_disagrees_when_leader_errored_but_it_succeeds(run):
    assert run.run_validator(leader_error=Exception("[LLM_ERROR] boom")) is False
