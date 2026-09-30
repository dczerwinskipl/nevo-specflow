---
id: ideas.specflow-runtime.ai-adapters.protocol-examples
type: reference
title: Provider protocol examples
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - providers
  - protocol
  - examples
  - fixtures
read_when:
  - implementing or reviewing provider event mapping
  - checking how provider-native output should map to reasoning, commentary, final answer, tools, or errors
  - creating minimized replay fixtures during provider migration
summary: >
  Sanitized and minimized provider event examples showing the mapping evidence behind the adapter
  hardening ideas, including output phases, reasoning, tools, quota/auth failures, advisory
  diagnostics, session establishment, and late-event cases.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.output-semantics
  - ideas.specflow-runtime.ai-adapters.error-classification
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - ideas.specflow-runtime.ai-adapters.invocation-ownership
---

# Provider protocol examples

These examples are intentionally small. They are not complete provider transcripts and MUST NOT be
treated as a frozen provider protocol specification.

Most examples are minimized from legacy Nevo tests/fixtures or verified provider observations.
Values such as IDs, paths, prompts, and answer text are sanitized or illustrative. The important
part is the **shape and classification evidence**.

When provider versions change, generated/current protocol schemas and fresh observations take
precedence.

## Claude-family examples

### Reasoning block

Provider stream:

```json
{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"I should inspect the repository first."}}
{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Then compare the implementation."}}
{"type":"content_block_stop","index":0}
```

Expected mapping:

```text
thinking / thinking_delta
  -> Work(type=reasoning)
```

Do not append these strings to commentary or final answer.

### Tool request

Provider stream:

```json
{
  "type": "content_block_start",
  "index": 1,
  "content_block": {
    "type": "tool_use",
    "id": "tool-provider-1",
    "name": "AskUserQuestion",
    "input": {
      "questions": [{
        "question": "Which database provider should be used?",
        "header": "Database",
        "options": [
          {"label": "PostgreSQL", "description": "Relational database"},
          {"label": "SQLite", "description": "Embedded database"}
        ],
        "multiSelect": false
      }]
    }
  }
}
```

Expected mapping:

```text
provider tool_use
  -> canonical tool/interaction semantics
  -> provider-private tool ID remains private correlation data
```

The provider-native ID must not become the public canonical interaction ID.

### Commentary before tool, final answer after tool

Illustrative minimized stream:

```json
{"type":"content_block_start","index":0,"content_block":{"type":"text","text":"I'll inspect the failing tests first."}}
{"type":"content_block_stop","index":0}
{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"Bash","input":{"command":"pnpm test"}}}
{"type":"content_block_stop","index":1}
{"type":"content_block_start","index":2,"content_block":{"type":"text","text":"The failure came from stale session correlation."}}
{"type":"content_block_stop","index":2}
{"type":"result","subtype":"success","result":"The failure came from stale session correlation."}
```

Expected mapping:

```text
"I'll inspect..."                     -> commentary
tool_use Bash                         -> tool Work
"The failure came..."                 -> final answer
terminal result repeating same text   -> dedupe, not a second final answer
```

The first text cannot be called final when emitted because later tool activity changes its meaning.

### Deferred interaction

Observed fixture shape:

```json
{
  "type": "message_delta",
  "delta": {"stop_reason": "tool_deferred"},
  "usage": {"output_tokens": 145},
  "deferred_tool_use": {
    "id": "tool-provider-1",
    "name": "AskUserQuestion",
    "input": {"questions": [{"question": "Which option?", "multiSelect": false}]}
  }
}
```

Expected interpretation:

- turn is not successfully terminal merely because the provider process reached this protocol point;
- canonical interaction is pending;
- provider correlation stays private;
- usage can be recorded independently.

## Codex app-server examples

### Explicit commentary

Provider notifications:

```json
{
  "method": "item/started",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "item": {
      "id": "message-1",
      "type": "agentMessage",
      "text": "",
      "phase": "commentary"
    }
  }
}
```

```json
{
  "method": "item/agentMessage/delta",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "itemId": "message-1",
    "delta": "I'll inspect the adapter first."
  }
}
```

```json
{
  "method": "item/completed",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "item": {
      "id": "message-1",
      "type": "agentMessage",
      "text": "I'll inspect the adapter first.",
      "phase": "commentary"
    }
  }
}
```

Expected mapping:

```text
agentMessage phase=commentary -> Work(type=commentary)
```

The delta does not need to repeat the phase if its `itemId` is correlated to the started item.

### Reasoning summary and content are distinct provider events

```json
{
  "method": "item/started",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "item": {"id":"reasoning-1","type":"reasoning","summary":[],"content":[]}
  }
}
```

```json
{
  "method": "item/reasoning/summaryTextDelta",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "itemId": "reasoning-1",
    "summaryIndex": 0,
    "delta": "Inspecting lifecycle"
  }
}
```

```json
{
  "method": "item/reasoning/textDelta",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "itemId": "reasoning-1",
    "contentIndex": 0,
    "delta": " and correlation behavior"
  }
}
```

Expected mapping:

```text
reasoning summary/content -> reasoning Work
```

Neither representation becomes final answer.

### Explicit final answer

```json
{
  "method": "item/started",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "item": {"id":"final-1","type":"agentMessage","text":"","phase":"final_answer"}
  }
}
```

```json
{
  "method": "item/agentMessage/delta",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "itemId": "final-1",
    "delta": "Done"
  }
}
```

```json
{
  "method": "item/completed",
  "params": {
    "threadId": "thread-1",
    "turnId": "turn-1",
    "item": {"id":"final-1","type":"agentMessage","text":"Done.","phase":"final_answer"}
  }
}
```

Expected mapping:

```text
phase=final_answer -> canonical finalAnswer
```

A successful `turn/completed` arriving before this item reaches authoritative completion should
not silently promote the partial delta. A legacy Nevo regression test deliberately fails closed in
that case.

### Missing phase compatibility fallback

Legacy-compatible event sequence:

```json
{"method":"item/started","params":{"item":{"id":"message-1","type":"agentMessage","text":""}}}
{"method":"item/agentMessage/delta","params":{"itemId":"message-1","delta":"Checking"}}
{"method":"item/completed","params":{"item":{"id":"message-1","type":"agentMessage","text":"Checking"}}}

{"method":"item/started","params":{"item":{"id":"message-2","type":"agentMessage","text":""}}}
{"method":"item/agentMessage/delta","params":{"itemId":"message-2","delta":"Finished"}}
{"method":"item/completed","params":{"item":{"id":"message-2","type":"agentMessage","text":"Finished"}}}

{"method":"turn/completed","params":{"turn":{"id":"turn-1","status":"completed"}}}
```

Expected deterministic fallback:

```text
message-1 -> commentary
message-2 -> final answer
```

The key is that `message-1` is not published as final and later retyped. It remains buffered until
a later candidate proves it was non-terminal.

### Command tool

Provider item start:

```json
{
  "id": "command-1",
  "type": "commandExecution",
  "command": "pnpm test",
  "cwd": "D:\\repo",
  "commandActions": [],
  "status": "inProgress"
}
```

Provider item completion:

```json
{
  "id": "command-1",
  "type": "commandExecution",
  "command": "pnpm test",
  "cwd": "D:\\repo",
  "commandActions": [],
  "status": "completed",
  "aggregatedOutput": "ok",
  "exitCode": 0,
  "durationMs": 12000
}
```

Expected mapping:

- one canonical tool Work item;
- start/update/completion share one operation identity;
- `aggregatedOutput` is tool output, never assistant final answer;
- command path uses Windows syntax here intentionally: mapping cannot assume POSIX paths.

### Compound command actions

A single provider command may contain structured nested actions:

```json
{
  "id": "command-2",
  "type": "commandExecution",
  "command": "node tools/check.mjs",
  "commandActions": [
    {"type":"list","path":"changes/active","title":"List active changes"},
    {"type":"read","path":"changes/active/example/change.yaml","title":"Read manifest"}
  ],
  "status": "inProgress"
}
```

Expected mapping:

```text
one provider commandExecution
  -> one canonical tool Work
  -> ordered nested ToolActions: list, read
```

Do not create two top-level tool invocations just because the provider exposes two command actions.

## Antigravity/Gemini-style examples

### Session establishment

```json
{"type":"init","conversation_id":"conversation-123"}
{"type":"text.delta","delta":"Hello"}
{"type":"done","result":"Hello"}
```

Expected interpretation:

- `conversation_id` establishes provider-native session identity;
- `text.delta` remains subject to pending commentary/final classification;
- `done.result` gives terminal answer evidence;
- if a new conversation never echoes a conversation ID, do not fabricate one.

### Tool lifecycle with auto-skipped question

```json
{
  "event": "step_update",
  "step_update": {
    "step_index": 1,
    "state": "ACTIVE",
    "step_type": "tool",
    "tool_name": "ask_question",
    "tool_info": {
      "name": "ask_question",
      "parameters": {"prompt": "Which option?"}
    }
  }
}
```

```json
{
  "event": "step_update",
  "step_update": {
    "step_index": 1,
    "state": "DONE",
    "step_type": "tool",
    "tool_name": "ask_question",
    "tool_info": {
      "name": "ask_question",
      "output": "A1: User Skipped"
    }
  }
}
```

```json
{
  "event": "result",
  "result": {
    "status": "SUCCESS",
    "response": "Done after skipped question"
  }
}
```

Expected mapping:

- tool start/completion is canonical tool Work;
- this transport observation does not imply that a real interactive question occurred;
- `User Skipped` is tool output;
- final response is `Done after skipped question`.

### Empty error_message as advisory noise

```json
{
  "event": "step_update",
  "step_update": {
    "conversation_id": "conversation-1",
    "step_index": 1,
    "state": "DONE",
    "step_type": "error_message"
  }
}
{"type":"done","result":"All good despite the noise."}
```

Legacy observed behavior treats the empty error step as diagnostic noise and allows the later
successful terminal result.

Expected mapping:

```text
empty error_message -> diagnostic evidence only
done(result)         -> successful terminal + final answer
```

### Repeated empty error_message can become stall evidence

Illustrative repeated sequence:

```json
{"event":"step_update","step_update":{"state":"DONE","step_type":"error_message"}}
{"event":"step_update","step_update":{"state":"DONE","step_type":"error_message"}}
{"event":"step_update","step_update":{"state":"DONE","step_type":"error_message"}}
```

One empty event is not enough to fail the turn. A sustained run of them with no other progress can
feed stall/liveness policy.

This is a good example of why:

```text
event type == error
```

is not a sufficient canonical decision.

### Concrete error_message

```json
{
  "event": "step_update",
  "step_update": {
    "state": "DONE",
    "step_type": "error_message",
    "message": "Provider quota exceeded."
  }
}
```

Expected classification:

```text
trusted provider error field
  -> quota classifier
  -> AI_QUOTA_EXHAUSTED (candidate canonical category)
```

The same words appearing inside normal assistant prose should not trigger this classification.

## Error-classification examples

The examples below intentionally show why evidence provenance matters.

### False-positive auth text inside successful assistant output

Assistant content:

```text
The API response "invalid bearer token" usually means the caller used an expired credential.
```

Context:

```text
assistant message
turn terminal status = completed
process exit = 0
no structured provider auth error
```

Expected classification:

```text
NOT AI_AUTH_FAILED
```

A regex over all stdout would be incorrect.

### Real auth failure

Illustrative terminal evidence:

```json
{
  "terminalStatus": "failed",
  "error": {
    "type": "authentication_error",
    "message": "invalid bearer token"
  },
  "httpStatus": 401
}
```

Expected:

```text
AI_AUTH_FAILED
source = structured terminal/provider error
```

### Usage/quota limit with reset hint

Illustrative provider failure text in a trusted terminal error field:

```text
You've hit your usage limit for this model. Try again at 7:00 PM.
```

Expected classifier result:

```text
category       = quota exhausted
retryNotBefore = parsed timestamp only if timezone/date semantics are unambiguous
raw diagnostic = retained separately
```

If the timestamp cannot be interpreted safely, category can still be quota while
`retryNotBefore` remains absent.

### Transient overload

Trusted terminal/provider error examples:

```text
rate limit exceeded
too many requests
server overloaded
temporarily unavailable
high demand
```

or structured status:

```text
HTTP 429
HTTP 529
```

Expected:

```text
temporary/transient provider failure
retryable = true (subject to Runtime policy)
```

A stronger deterministic class such as unknown session or max-turns should win before generic
transient matching.

### Structural process/harness crash

Observed evidence model:

```text
valid provider protocol event received
process exits non-zero
no provider terminal turn event received
```

Expected:

```text
process/transport failure
```

Do not require a magic stderr sentence to prove the harness disappeared.

## Late-event example

This is a lifecycle sequence rather than a provider wire format:

```text
T0  Runtime starts Turn A; providerSessionId is unknown
T1  provider process is alive
T2  user cancels Turn A
T3  Runtime settles Turn A = cancelled and removes active aliases
T4  old provider callback arrives: providerSessionId = "session-123"
```

Expected behavior at T4:

```text
canonical Turn mutation      rejected
active alias registration    rejected
interaction registration     rejected
durable session mutation     rejected unless separately valid under current ownership
raw diagnostic capture       optionally accepted as late/ignored evidence
```

An invocation generation/fence provides the ownership proof. A bare native session ID does not.

## Liveness example

Consider a command tool:

```text
12:00:00 provider emits tool start: pnpm test
12:00:10 no more provider protocol events
12:01:00 child compiler still consumes CPU / writes files
12:02:00 still no provider protocol event
12:02:10 tool emits completion
```

A watchdog based only on `protocolLastActivityAt` can kill valid work.

Preferred evidence model:

```text
protocol activity = stale
output activity   = maybe stale
process activity  = recent
=> do not declare inactivity yet
```

On platforms where process activity sampling is unavailable:

```text
process activity = unknown
```

not:

```text
process activity = zero
```

## Raw capture to replay fixture

A raw diagnostic may contain many irrelevant events:

```text
init
provider-global notification
provider-global notification
reasoning delta
tool start
50 tool output chunks
warning
assistant delta
terminal result
usage
shutdown noise
```

If the bug is "terminal result duplicated final answer", the durable regression fixture should be
reduced to something like:

```json
{"type":"content_block_start","content_block":{"type":"text","text":"Done."}}
{"type":"content_block_stop"}
{"type":"result","subtype":"success","result":"Done."}
```

Expected assertion:

```text
canonical final answer == "Done."
canonical final answer emitted once
```

That minimized fixture can live forever; the original raw session can expire.
