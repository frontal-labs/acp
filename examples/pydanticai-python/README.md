# PydanticAI + OCP

This example uses PydanticAI's async `Agent.run` API and maps its typed
`result.output` into an OCP `message.sent` event.

## Install and run

```bash
python3 -m venv .venv-pydanticai
. .venv-pydanticai/bin/activate
python -m pip install -r examples/pydanticai-python/requirements.txt
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src:examples/_shared/python python3 examples/pydanticai-python/main.py
```

Set `OCP_MODEL` to another supported PydanticAI model string. Keep structured
output validation in PydanticAI and event/envelope validation in OCP.
