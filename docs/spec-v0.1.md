# ACP Protocol Specification v0.1

## 1. Scope

ACP defines an event protocol for communication between agents, humans, and company systems through shared enterprise channels. It is transport-neutral. A provider adapter may use webhooks, polling, queues, REST, or another transport.

## 2. Envelope

`acp.v1.api.EventEnvelope` is the canonical wire object. Producers MUST populate `event_id`, `event_type`, `protocol_version`, `occurred_at`, and exactly one payload. Producers SHOULD populate actor, recipient, channel, conversation, correlation, causation, and idempotency fields when available.

The protocol version for this release is `0.1`. The protobuf field numbers in `proto/v1/api/events.proto` and `proto/v1/types/*.proto` are stable for the v0.1 compatibility line.

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

Consumers MUST reject an event with an unknown event type or a mismatched payload case. Consumers MAY preserve unknown extension fields for forward compatibility.

## 4. Approval and escalation

An agent requests approval by emitting `approval.requested` with an action, reason, approver, and deadline. The action MUST NOT execute until the owning system receives an explicit approval outcome and chooses to execute it.

When the deadline passes without a decision, the runtime emits `approval.expired`, followed by `escalation.triggered` targeting the configured approver or escalation target. Implementations may add richer escalation routing without changing the core event contract.

## 5. Policy

Policy evaluation produces `policy.allowed` or `policy.blocked`. An allowed decision may still set `approval_required`, which means the action is authorized to enter the approval flow but not to execute autonomously.

The reference policy engine uses ordered first-match rules and a configurable default. Production policy engines may use organizational roles, channel membership, time windows, data classification, or external authorization systems.

## 6. Idempotency and audit

`event_id` is the primary deduplication key. `idempotency_key` is available when a provider or action has a separate retry identity. A consumer MUST avoid applying the same event twice when it has already accepted the event ID.

The reference runtime records every accepted inbound and internally emitted event in an append-only `EventStore` interface. Durable implementations should preserve ordering metadata and make audit retrieval independently available from action execution.

## 7. Provider adapters

An adapter translates provider-native messages into `message.received` envelopes and translates outbound ACP message events into provider-native sends. Provider identifiers belong in `ChannelRef` and `extensions`; core event semantics remain provider-neutral.

The reference gateway keeps ingestion and dispatch separate: inbound events enter the runtime through `ingest`, while outbound events are explicitly sent through `dispatch`. This avoids treating a stored event as proof that a provider-side delivery succeeded and leaves retry/outbox policy to the host application.
