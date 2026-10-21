# acp-sdk

The PyPI distribution is `acp-sdk`, imported as `acp`. It provides an
application facade, an A2A-like agent card and host API, v0.1 and v0.2 event builders (one API, selected by `protocol_version`),
and transport-independent source/sink contracts.

```bash
python -m pip install acp-sdk
```

```python
app = AcpApp(
    store=event_store,  # required: any DurableStore (append_if_absent, all, close)
    agents=[agent],
    actions=[ActionDefinition("send_customer_reply", execute_reply)],
    channels=[ChannelDefinition("memory", sink=memory_sink)],
    policy=lambda action_type, actor, value, event: PolicyDecision(allowed=True),
)
await app.start()
await app.receive("slack", provider_payload)
await app.stop()
```

## Usage

```python
from acp import AcpApp, AgentDefinition, PolicyDecision

app = AcpApp(
    store=event_store,  # required: no default store is provided
    agents=[
        AgentDefinition(
            id="agent:support",
            name="Support Agent",
            on_message=lambda context: context.reply("I am looking into this."),
        )
    ],
    policy=lambda *_: PolicyDecision(allowed=True),
)
await app.start()
await app.stop()
```

`AgentContext.reply()` returns a validated ACP message event and dispatches it
through the configured sink. Use `list_agent_cards()` for discovery and
`context.actions.request()` for policy-aware application actions. `AgentHost`
remains available for lower-level composition.

## Development

```bash
ruff format --check sdks/python
ruff check sdks/python
PYTHONPATH=sdks/python/src python3 -m unittest discover -s sdks/python/tests -p 'test_*.py'
```
