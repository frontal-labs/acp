# OpenAI Agents Python + OCP

This example maps the OpenAI Agents SDK `Runner.run` result into an OCP reply.
It deliberately does not auto-approve SDK interruptions: an interruption or
approval request must be represented by an OCP policy/approval event and then
resumed explicitly.

## Install and run

```bash
python3 -m venv .venv-openai-agents
. .venv-openai-agents/bin/activate
python -m pip install -r examples/openai-agents-python/requirements.txt
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src:examples/_shared/python python3 examples/openai-agents-python/main.py
```

`OPENAI_MODEL` is optional. Use a disposable key and avoid destructive tools.

## OCP mapping

`Runner.run(agent, text)` is the harness execution. `result.final_output` is
converted to `message.sent`; `result.interruptions` stops the automatic path so
the application can create an explicit approval boundary.
