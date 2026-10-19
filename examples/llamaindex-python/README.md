# LlamaIndex + ACP

This example uses LlamaIndex's workflow `FunctionAgent` and maps its run result
to an ACP reply. Add retrieval or function tools inside the LlamaIndex agent;
keep provider identifiers and authorization decisions outside those tools.

## Install and run

```bash
python3 -m venv .venv-llamaindex
. .venv-llamaindex/bin/activate
python -m pip install -r examples/llamaindex-python/requirements.txt
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src:examples/_shared/python python3 examples/llamaindex-python/main.py
```

## ACP mapping

`context.message.text` becomes the LlamaIndex prompt and the result becomes
`message.sent`. Document conversation-scoped memory and tool context explicitly
when extending this example.
