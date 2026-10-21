import unittest
from datetime import UTC, datetime

from open_channel import (
    ActorRef,
    EventEnvelope,
    action_executed,
    action_failed,
    approval_requested,
    event_from_binary,
    event_from_json,
    event_to_binary,
    event_to_json,
    event_type_of,
    message_received,
    message_sent,
    parse_event,
    validate_event,
)

AGENT = ActorRef("agent:approvals", type="ACTOR_TYPE_AGENT")
APPROVER = ActorRef("human:approver", type="ACTOR_TYPE_HUMAN")
DEADLINE = datetime(2030, 1, 1, tzinfo=UTC)
ACTION = {
    "actionId": "action-release-1",
    "type": "deploy.release",
    "target": "staging",
    "parameters": {"env": "staging"},
}


def _approval_requested(version: str) -> EventEnvelope:
    return approval_requested(
        agent=AGENT,
        approver=APPROVER,
        approval_id="approval-1",
        reason="needs sign-off",
        requested_action=ACTION,
        deadline=DEADLINE,
        protocol_version=version,
    )


class ProtocolVersionTests(unittest.TestCase):
    def test_default_protocol_version_is_v01(self) -> None:
        event = message_received(text="hi")
        self.assertEqual(event.protocol_version, "0.1")
        self.assertEqual(event.to_proto_json()["eventType"], "message.received")

    def test_v02_builder_omits_event_type_and_derives_name(self) -> None:
        event = message_sent(text="hi", protocol_version="0.2")
        value = event.to_proto_json()

        self.assertNotIn("eventType", value)
        self.assertEqual(value["protocolVersion"], "0.2")
        self.assertEqual(event_type_of(event), "message.sent")
        self.assertEqual(event.event_type, "message.sent")

    def test_policy_and_approval_names_derive_from_payload(self) -> None:
        granted = EventEnvelope(
            payload={
                "approvalDecided": {"approvalId": "a1", "outcome": "APPROVAL_OUTCOME_GRANTED"}
            },
            protocol_version="0.2",
        )
        denied = EventEnvelope(
            payload={"approvalDecided": {"approvalId": "a1", "outcome": "APPROVAL_OUTCOME_DENIED"}},
            protocol_version="0.2",
        )
        allowed = EventEnvelope(
            payload={"policyEvaluated": {"allowed": True}}, protocol_version="0.2"
        )
        blocked = EventEnvelope(
            payload={"policyEvaluated": {"allowed": False}},
            protocol_version="0.1",
            event_type="policy.blocked",
        )

        self.assertEqual(event_type_of(granted), "approval.granted")
        self.assertEqual(event_type_of(denied), "approval.denied")
        self.assertEqual(event_type_of(allowed), "policy.allowed")
        self.assertEqual(event_type_of(blocked), "policy.blocked")

    def test_v02_mismatched_event_type_raises_with_ts_equivalent_message(self) -> None:
        with self.assertRaises(ValueError) as wrong_case:
            EventEnvelope(
                event_type="message.sent",
                payload={"messageReceived": {"text": "x"}},
                protocol_version="0.2",
            )
        self.assertEqual(
            str(wrong_case.exception),
            "OCP event message.sent requires payload case messageSent, received messageReceived",
        )

        with self.assertRaises(ValueError) as wrong_outcome:
            EventEnvelope(
                event_type="approval.denied",
                payload={
                    "approvalDecided": {"approvalId": "a1", "outcome": "APPROVAL_OUTCOME_GRANTED"}
                },
                protocol_version="0.2",
            )
        self.assertEqual(
            str(wrong_outcome.exception),
            "OCP event approval.denied does not match payload event approval.granted",
        )

    def test_version_shape_mismatch_raises(self) -> None:
        v2_json = event_to_json(message_received(text="x", protocol_version="0.2"))
        v1_json = event_to_json(message_received(text="x"))

        # v0.2 shape claiming v0.1 (eventType present under protocolVersion 0.2).
        with self.assertRaises(ValueError):
            event_from_json({**v2_json, "eventType": "message.received"})
        # v0.1 shape without eventType is rejected.
        without_type = {key: value for key, value in v1_json.items() if key != "eventType"}
        with self.assertRaises(ValueError):
            event_from_json(without_type)
        # Unknown protocol versions are rejected by the builder and the decoder.
        with self.assertRaises(ValueError):
            message_received(text="x", protocol_version="0.3")
        with self.assertRaises(ValueError):
            event_from_json({**v1_json, "protocolVersion": "9.9"})
        # Binary frame carrying v0.2 cannot be decoded as an explicit v0.1 event.
        with self.assertRaises(ValueError):
            event_from_binary(
                event_to_binary(message_received(text="x", protocol_version="0.2")), "0.1"
            )

    def test_approval_requested_builds_and_validates_in_both_versions(self) -> None:
        for version in ("0.1", "0.2"):
            with self.subTest(version=version):
                event = _approval_requested(version)
                validate_event(event)
                self.assertEqual(event_type_of(event), "approval.requested")
                self.assertEqual(event.payload_case, "approvalRequested")
                self.assertEqual(event.recipient, APPROVER)
                decoded = event_from_json(event_to_json(event))
                self.assertEqual(event_type_of(decoded), "approval.requested")
                self.assertEqual(decoded.payload_case, "approvalRequested")

    def test_action_executed_and_failed_build_and_validate_in_both_versions(self) -> None:
        for version in ("0.1", "0.2"):
            with self.subTest(version=version):
                executed = action_executed(action=ACTION, result="ok", protocol_version=version)
                failed = action_failed(
                    action=ACTION,
                    error_code="RATE_LIMITED",
                    error_message="slow down",
                    retryable=True,
                    protocol_version=version,
                )
                validate_event(executed)
                validate_event(failed)
                self.assertEqual(event_type_of(executed), "action.executed")
                self.assertEqual(event_type_of(failed), "action.failed")

                failed_json = failed.to_proto_json()
                self.assertEqual(failed_json["actionFailed"]["errorCode"], "RATE_LIMITED")
                self.assertTrue(failed_json["actionFailed"]["retryable"])
                self.assertEqual(event_from_json(failed_json).payload_case, "actionFailed")
                self.assertEqual("eventType" in failed_json, version == "0.1")

    def test_invariants_are_enforced_for_v01(self) -> None:
        with self.assertRaises(ValueError) as error:
            EventEnvelope(
                event_type="approval.denied",
                payload={
                    "approvalDecided": {"approvalId": "a1", "outcome": "APPROVAL_OUTCOME_GRANTED"}
                },
            )
        self.assertEqual(str(error.exception), "approval.denied must have a denied outcome")

        with self.assertRaises(ValueError):
            EventEnvelope(
                event_type="policy.allowed", payload={"policyEvaluated": {"allowed": False}}
            )

    def test_parse_event_bytes_require_explicit_protocol_version(self) -> None:
        data = event_to_binary(message_received(text="x", protocol_version="0.2"))

        with self.assertRaises(ValueError):
            parse_event(data)

    def test_parse_event_bytes_round_trip_for_both_versions(self) -> None:
        for version in ("0.1", "0.2"):
            with self.subTest(version=version):
                event = message_received(text="hello", protocol_version=version)
                parsed = parse_event(event_to_binary(event), protocol_version=version)

                self.assertEqual(parsed.protocol_version, version)
                self.assertEqual(parsed.payload_case, "messageReceived")
                self.assertEqual(event_type_of(parsed), "message.received")
                self.assertEqual(parsed.event_id, event.event_id)

    def test_parse_event_mapping_auto_detects_version(self) -> None:
        self.assertEqual(
            parse_event(
                event_to_json(message_received(text="a", protocol_version="0.2"))
            ).protocol_version,
            "0.2",
        )
        self.assertEqual(
            parse_event(event_to_json(message_received(text="a"))).protocol_version, "0.1"
        )


if __name__ == "__main__":
    unittest.main()
