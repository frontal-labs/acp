import base64
import json
import unittest
from datetime import UTC, datetime
from pathlib import Path

from open_channel import (
    ActorRef,
    EventEnvelope,
    action_executed,
    action_failed,
    approval_requested,
    event_from_binary,
    event_to_binary,
    event_type_of,
)

# Written by the TypeScript encoder (protobuf-es); the Python codec must match it byte for byte.
FIXTURE_PATH = (
    Path(__file__).resolve().parent / "../../../packages/protocol/tests/fixtures/event-parity.json"
)

AGENT = ActorRef("agent:approvals", type="ACTOR_TYPE_AGENT", display_name="Approvals Agent")
APPROVER = ActorRef("human:approver", type="ACTOR_TYPE_HUMAN", display_name="Approver")
DEADLINE = datetime(2030, 1, 1, tzinfo=UTC)
ACTION = {
    "actionId": "action-release-1",
    "type": "deploy.release",
    "target": "staging",
    "parameters": {"env": "staging"},
}


def _load_fixture() -> list[dict[str, str]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


class ParityFixtureTests(unittest.TestCase):
    def test_fixture_covers_every_payload_kind_in_both_versions(self) -> None:
        entries = _load_fixture()
        self.assertEqual(len(entries), 30)
        self.assertEqual({entry["protocolVersion"] for entry in entries}, {"0.1", "0.2"})

    def test_each_entry_decodes_by_type_and_re_encodes_byte_identical(self) -> None:
        for entry in _load_fixture():
            with self.subTest(name=entry["name"]):
                version = entry["protocolVersion"]
                data = base64.b64decode(entry["binary"])

                event = event_from_binary(data, version)
                self.assertEqual(event_type_of(event), entry["eventType"])
                self.assertEqual(event.protocol_version, version)

                self.assertEqual(event_to_binary(event), data)

    def test_decoding_with_the_wrong_version_is_rejected(self) -> None:
        for entry in _load_fixture():
            with self.subTest(name=entry["name"]):
                other = "0.2" if entry["protocolVersion"] == "0.1" else "0.1"
                with self.assertRaises(ValueError):
                    event_from_binary(base64.b64decode(entry["binary"]), other)


class BuilderBinaryRoundTripTests(unittest.TestCase):
    def _assert_round_trip(self, event: EventEnvelope, expected_type: str) -> None:
        data = event_to_binary(event)
        decoded = event_from_binary(data, event.protocol_version)
        self.assertEqual(event_type_of(decoded), expected_type)
        self.assertEqual(decoded.payload_case, event.payload_case)
        self.assertEqual(decoded.event_id, event.event_id)
        # proto3 drops default-valued scalars (false, "") on the wire, so compare non-default values.
        case = event.payload_case
        self.assertEqual(set(decoded.payload), {case})
        for key, item in event.payload[case].items():
            if item in ("", False) or item == {} or item == []:
                continue
            self.assertEqual(decoded.payload[case][key], item, key)
        self.assertEqual(event_to_binary(decoded), data)

    def test_approval_requested_round_trips_in_both_versions(self) -> None:
        for version in ("0.1", "0.2"):
            with self.subTest(version=version):
                event = approval_requested(
                    agent=AGENT,
                    approver=APPROVER,
                    approval_id="approval-1",
                    reason="needs sign-off",
                    requested_action=ACTION,
                    deadline=DEADLINE,
                    protocol_version=version,
                    correlation_id="corr-1",
                )
                self._assert_round_trip(event, "approval.requested")

    def test_action_executed_round_trips_in_both_versions(self) -> None:
        for version in ("0.1", "0.2"):
            with self.subTest(version=version):
                event = action_executed(action=ACTION, result="released", protocol_version=version)
                self._assert_round_trip(event, "action.executed")

    def test_action_failed_round_trips_in_both_versions(self) -> None:
        for version in ("0.1", "0.2"):
            with self.subTest(version=version):
                event = action_failed(
                    action=ACTION,
                    error_code="RATE_LIMITED",
                    error_message="slow down",
                    retryable=True,
                    protocol_version=version,
                )
                self._assert_round_trip(event, "action.failed")

    def test_policy_evaluated_round_trips_in_both_versions(self) -> None:
        # There is no policy builder in the SDK, so the payload is constructed directly.
        for version in ("0.1", "0.2"):
            for allowed, expected in ((True, "policy.allowed"), (False, "policy.blocked")):
                with self.subTest(version=version, allowed=allowed):
                    payload = {
                        "policyEvaluated": {
                            "policyId": "policy-1",
                            "allowed": allowed,
                            "approvalRequired": not allowed,
                            "reason": "rule matched",
                            "actionType": "deploy.release",
                            "recipient": {"id": "agent:approvals", "type": "ACTOR_TYPE_AGENT"},
                        }
                    }
                    event = EventEnvelope(
                        event_type=expected if version == "0.1" else "",
                        payload=payload,
                        protocol_version=version,
                    )
                    self._assert_round_trip(event, expected)


if __name__ == "__main__":
    unittest.main()
