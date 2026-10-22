# LangChain Python + OCP

Runs a LangChain v1 `create_agent` agent behind the Python SDK's `open_channel()` app. The OCP
bridge turns the inbound `message.received` text into a LangChain user message, and turns the
final model message into the `message.sent` reply.

This example makes a live OpenAI model call and needs an API key. Without `OPENAI_API_KEY` it
exits with status 1 and a message naming the variable. The event store and channel sink in
`main.py` are demo-only in-memory objects; production apps use a durable store and a real
channel sink.

## Prerequisites

- Python 3.11 or later
- An OpenAI API key, created at <https://platform.openai.com/api-keys>
- A checkout of this repository

## Install

From the repository root:

```bash
python3 -m venv .venv-langchain
. .venv-langchain/bin/activate
python -m pip install -r examples/langchain-python/requirements.txt
```

## Run

```bash
export OPENAI_API_KEY=replace-me
PYTHONPATH=sdks/python/src python3 examples/langchain-python/main.py
```

Do not use a production key or destructive tools while experimenting.

## Environment variables

| Variable         | Required | Default       | Purpose                                       |
| ---------------- | -------- | ------------- | --------------------------------------------- |
| `OPENAI_API_KEY` | yes      | none          | Read by `langchain-openai` for the model call |
| `OPENAI_MODEL`   | no       | `gpt-4o-mini` | Chat model name passed to `ChatOpenAI`        |

## Expected output

One JSON document with the agent card, the inbound event ID, and the outbound `message.sent`
event. `text` is the model's answer and varies by run:

```json
{
  "agentCard": { "id": "agent:langchain-python", "name": "LangChain Python Agent", "...": "..." },
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

| OCP concept        | In `main.py`                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `message.received` | `message_received(...)` ingested by `open_channel`                    |
| Harness execution  | `agent.ainvoke(...)` inside the agent handler                         |
| `message.sent`     | `response_text(result)` passed to `context.reply(...)`                |

- `context.message.text` becomes LangChain's user message.
- `response_text` reads `result["messages"][-1].content` and returns the text.
- LangChain tools that mutate state must call an OCP action boundary (`context.request(...)`)
  rather than execute directly from the model callback, so the policy and approval path applies.
