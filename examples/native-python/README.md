# Native Python OCP

This example uses the Python SDK's `AgentHost` and `EventEnvelope` directly.
It is deterministic and does not require a model provider or credentials.

## Run

From the repository root:

```bash
PYTHONPATH=sdks/python/src:examples/_shared/python python3 examples/native-python/main.py
```

The output shows an OCP agent card, a routed `message.received` event, and the
resulting `message.sent` event. Replace the lambda with a framework invocation
while preserving the same `run_ocp_text_agent` boundary.
