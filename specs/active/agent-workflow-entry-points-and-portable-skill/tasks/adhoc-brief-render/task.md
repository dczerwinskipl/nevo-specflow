# Ad-hoc brief rendering

## Goal

Minting the capability of an ad-hoc write Turn of a Specification Session yields a compact SpecFlow
brief, rendered from the home Specification's documents and the ad-hoc scope (C4, architecture.md S6
first bullet, S9).

## Scope

- Engine `workflow/agent/context/`: `readAgentSessionContext(specId)` returns `{ documents,
documentTypes }` in `AgentStepContext`'s shapes, with paths relative to the Session's workspace.
  It reuses the document and type part of `gatherAgentContext`, and takes no claim and no lock.
- Runtime `features/agent-execution/brief/render.ts`: `renderAdHocBrief` as C4 states (helpers and
  budgets reused, operations from `AGENT_COMMANDS` filtered by the ad-hoc scope, the 50-document cut,
  the added rules, at most 16 KiB). The copy says "the agent" and "Run with agent", never "turn",
  "claim" or "capability" (ux.md).
- Runtime `feature.ts`: `InvocationCapabilities.mint` returns `brief?: { text, sha256 }` on the ad-hoc
  branch of `scopeOf`, after `grant.redact`. When the documents read fails, the brief is rendered
  without the list and says so. When rendering fails, mint fails, so the Turn is not dispatched (the
  existing not-dispatched path abandons the claim).

Out: sending and storing the brief (Task `adhoc-brief-delivery`).

## Verification

- Unit (Engine): `readAgentSessionContext` returns the home Specification's documents and types with
  workspace-relative paths.
- Unit (Runtime): a snapshot of the brief, the 16 KiB and line budgets, the 50-document cut and its
  "and N more" line, redaction, no capability, credential or absolute path in the text, the
  read-failure brief, and mint failing when rendering fails.
- Unit: an attempt scope and a read-only scope get no brief.

## Planning notes

Work kind: backend. Recommended profile: `nevo-agents:implementer`.
