# Native Python OCP

A deterministic OCP agent built on the Python SDK's `open_channel()` app. It shows the
core loop: a `message.received` event reaches an agent handler, the handler replies with
`context.reply(...)`, and the resulting `message.sent` event reaches a channel sink.

No model provider, network access, or credentials are needed.

## Prerequisites

- Python 3.11 or later
- A checkout of this repository (the example imports the SDK from `sdks/python/src`)

## Install

Run from the repository root. Either use the source SDK directly (no install step):

```bash
PYTHONPATH=sdks/python/src python3 examples/native-python/main.py
```

or install the published package and omit `PYTHONPATH`:

```bash
python3 -m pip install -r examples/native-python/requirements.txt
python3 examples/native-python/main.py
```

## Run

```bash
PYTHONPATH=sdks/python/src python3 examples/native-python/main.py
```

Exit code is `0` on success.

## Environment variables

None. This example reads no environment variables.

## Expected output

The output is a JSON document. The reply text is fixed; IDs vary by run:

```json
{
  "agentCard": { "id": "agent:native-python", "name": "Native Python Agent", "...": "..." },
  "received": { "eventType": "message.received", "eventId": "<uuid>" },
  "sent": {
    "eventType": "message.sent",
    "correlationId": "<uuid, equal to received eventId>",
    "causationId": "<uuid, equal to received eventId>",
    "text": "Deterministic response to: Explain why OCP keeps policy outside the model prompt."
  }
}
```

## How this maps to OCP

| OCP concept                  | In `main.py`                                              |
| ---------------------------- | --------------------------------------------------------- |
| `message.received`           | `message_received(...)` with actor, recipient, channel, conversation |
| Agent host registration      | `AgentDefinition(on_message=...)`                         |
| Agent reply                  | `context.reply(...)` produces `message.sent`              |
| Channel delivery             | `ChannelDefinition(PROVIDER, sink=...)`                   |
| Policy                       | `policy=` (this example allows everything)                |
| Durable event identity       | `DemoMemoryStore` (demo-only; use a durable store in production) |

To use a real model, replace `deterministic_reply` with a framework call and keep the
`on_message` boundary: read `context.message.text`, then reply with `context.reply(...)`.
Other examples in this directory show that pattern with LangChain, LlamaIndex, and others.
