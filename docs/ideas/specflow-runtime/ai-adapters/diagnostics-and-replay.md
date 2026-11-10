---
id: ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
type: engineering
title: Provider diagnose API and protocol replay
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - diagnostics
  - replay
  - fixtures
  - protocol
read_when:
  - adding a provider environment check
  - adding regression coverage for provider protocol drift
summary: >
  Open items: a provider-owned diagnose() API with independent checks, and a capture-to-replay
  harness that turns minimized protocol captures into deterministic parser fixtures.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - ideas.specflow-runtime.ai-adapters.provider-error-examples
  - reference.protocols.session-provider-driver
---

# Provider diagnose API and protocol replay

Implemented today: private, disabled-by-default, sanitized in-memory diagnostics capture with
bounded retention, and controlled-process/protocol tests per adapter
([driver protocol](../../../reference/protocols/session-provider-driver.md#process-environment)).

## `diagnose()` API

A provider-owned operation, distinct from `describe`/`refresh`/`validate`, returning the
independent checks described in [readiness follow-ups](provider-readiness-and-auth.md#layer-2-explicit-diagnose-lane):
executable path and version, protocol features, authentication where safely testable, configured
model, workspace accessibility, temp/config writability, interaction bridge reachability and
platform limitations. Results are bounded, use stable codes and never expose raw command output.
Exact naming and HTTP exposure are undecided.

## Capture-to-replay harness

Goal: feed minimized NDJSON/JSON-RPC/event sequences through each provider's pure protocol
interpreter without launching a CLI, asserting channel classification, tool start/update/completion,
session establishment, usage, error class and retry metadata, terminal disposition and unknown-frame
behavior.

- Keep the interpreter (raw events -> neutral driver facts) separable from process orchestration.
- Turning a capture into a fixture: minimize to the smallest reproducing sequence; redact secrets and
  unneeded content; normalize timestamps and opaque IDs unless identity is the case; annotate the
  protected behavior; store expected facts next to the fixture. The original capture is not needed
  afterwards, and fixtures are engineering evidence, not user history.
- Protocol drift: replay existing fixtures against the new parser, add a fixture for the new shape,
  and prefer an explicit protocol-compatibility failure over guessing lifecycle or final answer.
- The suite runs without credentials, installed CLIs, network, real home state or real MCP servers.

Candidate fixtures are listed in [provider error and limit evidence](provider-error-examples.md#fixture-backlog).
