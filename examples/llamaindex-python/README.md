# LlamaIndex + OCP

Runs a LlamaIndex workflow `FunctionAgent` behind the Python SDK's `open_channel()` app. The
inbound `message.received` text becomes the agent prompt, and the agent's final response becomes
the `message.sent` reply.

This example makes a live OpenAI model call and needs an API key. Without `OPENAI_API_KEY` it
exits with status 1 and a message naming the variable.

## Prerequisites

- Python 3.11 or later
- An OpenAI API key, created at <https://platform.openai.com/api-keys>
- A checkout of this repository

## Install

From the repository root:

```bash
python3 -m venv .venv-llamaindex
. .venv-llamaindex/bin/activate
python -m pip install -r examples/llamaindex-python/requirements.txt
```

## Run

```bash
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src python3 examples/llamaindex-python/main.py
```

Use a disposable key and non-destructive tools.

## Environment variables

| Variable         | Required | Default       | Purpose                                                |
| ---------------- | -------- | ------------- | ------------------------------------------------------ |
| `OPENAI_API_KEY` | yes      | none          | Read by `llama-index-llms-openai` for the model call   |
| `OPENAI_MODEL`   | no       | `gpt-4o-mini` | Model name passed to `llama_index.llms.openai.OpenAI`  |

## Expected output

One JSON document with the agent card, the inbound event ID, and the outbound `message.sent`
event. `text` is the model's answer and varies by run:

```json
{
  "agentCard": { "id": "agent:llamaindex-python", "name": "LlamaIndex Agent", "...": "..." },
  "received": { "eventType": "message.received", "eventId": "<uuid>" },
  "sent": {
    "eventType": "message.sent",
    "correlationId": "<uuid, equal to received eventId>",
    "causationId": "<uuid, equal to received eventId>",
    "text": "<model answer>"
  }
}
```

## How this maps to OCP

| OCP concept        | In `main.py`                                                 |
| ------------------ | ------------------------------------------------------------ |
| `message.received` | `message_received(...)` ingested by `open_channel`           |
| Harness execution  | `agent.run(context.message.text)` inside the agent handler   |
| `message.sent`     | `str(result)`, passed to `context.reply(...)`                |

Add retrieval or function tools to the `FunctionAgent` in `main.py`. Keep provider identifiers
and authorization decisions outside those tools. Document conversation-scoped memory and tool
context explicitly when you extend the example.
