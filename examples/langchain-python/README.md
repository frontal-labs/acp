# LangChain Python + ACP

This example uses LangChain v1 `create_agent` behind the ACP Python
`AgentHost`. The ACP bridge converts the incoming `message.received` text into
the LangChain message list and converts the final model message into
`message.sent`.

## Install and run

```bash
python3 -m venv .venv-langchain
. .venv-langchain/bin/activate
python -m pip install -r examples/langchain-python/requirements.txt
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src:examples/_shared/python python3 examples/langchain-python/main.py
```

`OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`. Do not use a
production key or destructive tools while experimenting.

## ACP mapping

- ACP actor, recipient, channel, conversation, and correlation data enter the
  `AgentHost` context.
- `context.message.text` becomes LangChain's user message.
- `result["messages"][-1].content` becomes the ACP reply text.
- LangChain tools that mutate state must call an ACP action boundary rather
  than execute directly from the model callback.
