# CrewAI + ACP

This example runs a one-task CrewAI crew for each ACP message and maps the
crew's result to `message.sent`. A reusable crew can be appropriate for a
controlled workload, but task inputs and mutable tools must be scoped to the
ACP conversation and policy context.

## Install and run

```bash
python3 -m venv .venv-crewai
. .venv-crewai/bin/activate
python -m pip install -r examples/crewai-python/requirements.txt
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src:examples/_shared/python python3 examples/crewai-python/main.py
```

## ACP mapping

The ACP inbound text becomes the CrewAI task input. `Crew.akickoff` owns agent
orchestration; ACP owns event identity, delivery, authorization, and approval.
Do not put an unrestricted destructive tool on the worker without routing it
through an ACP action policy.
