# OCP protobuf schemas

The canonical wire contract. There is one protocol version, `2.0`, and one envelope.

```text
proto/ocp/api/events.proto     ocp.api.EventEnvelope (the single envelope)
proto/ocp/types/*.proto        ocp.types.* domain messages
proto/gen/                     generated bindings (do not edit by hand)
```

The package names are `ocp.api` and `ocp.types`. There is no version suffix: the protocol version is carried by the `protocol_version` field of each envelope.

## Compatibility rules

- Field numbers and package names are stable. Add fields; never renumber or reuse one.
- Field 2 is the removed `event_type` string. It is `reserved`, so its number and name stay retired.
- The event name is derived from the payload `oneof`. Do not add a second type field.

## Workflow

Edit the schemas, then run `pnpm generate`, inspect the generated diff, and run `pnpm proto:lint` and the language tests.
