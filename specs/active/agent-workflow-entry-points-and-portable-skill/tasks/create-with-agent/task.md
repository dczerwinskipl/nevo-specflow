# Create with an agent in project mode

## Goal

The project Create form offers **With an agent**. It creates the Specification, then starts Run with
agent on the archetype's first step as a real E6 attempt, and lands in that Session. It never reports
the Specification as prepared (L131, D4, D5, C6, architecture.md S7, S8).

## Scope

- UI `features/specs/creation/`, as ux.md "Create with an agent (project mode)" states:
  - the method step, shown only when a selectable archetype has `firstStep.agent` (Task
    `archetype-first-step`); With an agent lists only those archetypes; Change the way of working
    keeps or clears the archetype;
  - the agent fields as in the Run with agent dialog (provider registry facts only, no Work mode, no
    note), with the not-ready and no-ready-provider cases;
  - the action, its progress states and Cancel only before Create is sent.
- The chain: after the Create operation is `completed`, `POST .../workflow/agent-execution` with
  `expected: { step: firstStep.id }`, the provider, model and effort, and a `requestId` that is a UUID
  v5 of `<createOperationId>:agent-start` under a fixed SpecFlow namespace constant, computed with Web
  Crypto SHA-1. The agent choice is kept in the client-side record of the pending Create.
- The outcomes: success goes to `/sessions/:sessionId` with the toast; a refused start goes to the
  Overview with the notice and the Engine reason; a lost answer shows "The agent may have started.
  Check again." and reads the projection first; a missing pending record starts nothing and shows
  the did-not-start notice. The UI never sends a second start under a new request id. A failed
  Create behaves as today.
- No copy says "prepared", "ready" or "done" for the Specification. The demo Create does not change.
- Docs: project-mode Create with an agent in `product.specflow.specification-creation`, the client
  chain of two calls in `architecture.runtime.specification-create-lifecycle`, and the L131 open item
  in `ideas.specflow-ui` (README).

## Verification

- Unit: the request id (a known vector, the same input giving the same id, and it passes
  `RequestIdSchema`).
- Stories or component tests: an archetype whose first step is an agent's step (lands in the Session
  with the toast), none (no method step), a refused start (Overview notice and Run with agent, the
  Specification listed), a lost answer, a reload without the pending record, and Change the way of
  working.
- The UX acceptance of ux.md for Create, and A7.

## Planning notes

Work kind: ui (it uses only existing routes). Recommended profile: `nevo-agents:implementer-ui`.
