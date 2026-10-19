# acp-sdk

The PyPI distribution is `acp-sdk`, imported as `acp`. It provides an
application facade, an A2A-like agent card and host API, ProtoJSON-shaped
models, and transport-independent channel contracts.

```bash
python -m pip install acp-sdk
```

```python
app = AcpApp(
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
from acp import AgentDefinition, AgentHost

host = AgentHost()
host.register(
    AgentDefinition(
        id="agent:support",
        name="Support Agent",
        on_message=lambda context: context.reply("I am looking into this."),
    )
)
handled = await host.handle(event)
```

`AgentContext.reply()` returns a validated ACP message event and optionally dispatches it through the callback passed to `AgentHost(dispatch=...)`. Use `list_agent_cards()` for discovery and `request_action()` for policy-aware application actions.

## Development

```bash
ruff format --check sdks/python
ruff check sdks/python
PYTHONPATH=sdks/python/src python3 -m unittest discover -s sdks/python/tests -p 'test_*.py'
```
