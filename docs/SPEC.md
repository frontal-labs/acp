# OCP Protocol Specification 2.0

## 1. Scope

OCP defines an event protocol for communication between agents, humans, and company systems through shared enterprise channels. It is transport-neutral. A provider adapter may use webhooks, polling, queues, REST, or another transport.

## 2. Envelope

`ocp.api.EventEnvelope` is the only wire object. Producers MUST populate `event_id`, `protocol_version`, `occurred_at`, and exactly one payload. Producers SHOULD populate actor, recipient, channel, conversation, correlation, causation, and idempotency fields when available.

The protocol version is `2.0`. Consumers MUST reject an envelope whose `protocol_version` is not `2.0`.

The event name is derived from the payload `oneof`; the envelope does not store a second copy. Field 2 was the former `event_type` string and is `reserved`; its number and name MUST NOT be reused. The protobuf field numbers in `proto/ocp/api/events.proto` and `proto/ocp/types/*.proto` are stable.

## 3. Event and payload mapping

| Event type | Payload case |
| --- | --- |
| `message.received` | `messageReceived` |
| `message.sent` | `messageSent` |
| `task.created` | `taskCreated` |
| `task.assigned` | `taskAssigned` |
| `approval.requested` | `approvalRequested` |
| `approval.granted` / `approval.denied` | `approvalDecided` |
| `approval.expired` | `approvalExpired` |
| `escalation.triggered` | `escalationTriggered` |
| `handoff.initiated` | `handoffInitiated` |
| `handoff.completed` | `handoffCompleted` |
| `policy.allowed` / `policy.blocked` | `policyEvaluated` |
| `action.executed` | `actionExecuted` |
| `action.failed` | `actionFailed` |

Consumers MUST reject an event whose payload is missing or unknown. The event name is always derived from the payload, so a mismatched name cannot be expressed. Consumers MAY preserve unknown extension fields for forward compatibility.

## 4. Approval and escalation

An agent requests approval by emitting `approval.requested` with an action, reason, approver, and deadline. The action MUST NOT execute until the owning system receives an explicit approval outcome and chooses to execute it.

When the deadline passes without a decision, the runtime emits `approval.expired`, followed by `escalation.triggered` targeting the configured approver or escalation target. Implementations may add richer escalation routing without changing the core event contract.

## 4a. Restart recovery

An implementation MUST rebuild approval state from its event store before accepting new work. Only approval events whose `source` is the runtime actor are trusted; approval lifecycle events received from outside MUST be rejected at ingest and MUST NOT be restored. Unresolved `approval.requested` events are tracked again and their expiry is rescheduled at the stored deadline; a deadline that passed while the process was down expires immediately. A `approval.granted` event with no terminal action event for its action MUST be executed once, and recovery MUST NOT re-run an action that already reached `action.executed` or `action.failed`.

## 5. Policy

Policy evaluation produces `policy.allowed` or `policy.blocked`. An allowed decision may still set `approval_required`, which means the action is authorized to enter the approval flow but not to execute autonomously.

The reference policy engine uses ordered first-match rules and a configurable default. Production policy engines may use organizational roles, channel membership, time windows, data classification, or external authorization systems.

## 6. Idempotency and audit

`event_id` is the primary deduplication key. `idempotency_key` is available when a provider or action has a separate retry identity. A consumer MUST avoid applying the same event twice when it has already accepted the event ID.

The reference runtime records every accepted inbound and internally emitted event in an append-only `EventStore` interface. Durable implementations should preserve ordering metadata and make audit retrieval independently available from action execution.

## 7. Provider adapters

An adapter translates provider-native messages into `message.received` envelopes and translates outbound OCP message events into provider-native sends. Provider identifiers belong in `ChannelRef` and `extensions`; core event semantics remain provider-neutral.

The reference gateway keeps ingestion and dispatch separate: inbound events enter the runtime through `ingest`, while outbound events are explicitly sent through `dispatch`. This avoids treating a stored event as proof that a provider-side delivery succeeded and leaves retry/outbox policy to the host application.

## 8. Serialization

Events serialize to ProtoJSON (`toJson` / `fromJson`) and to binary protobuf (`toBinary` / `fromBinary`). Both encodings carry the same envelope, so decoding needs no version argument. Untrusted input MUST be validated on decode.

## 9. Compatibility

Version `2.0` replaces the two earlier envelopes. Earlier binary payloads that have no `event_type` field decode unchanged. Earlier ProtoJSON payloads that include `eventType` are rejected by `fromJson`, and must be re-serialized from the typed builders.
