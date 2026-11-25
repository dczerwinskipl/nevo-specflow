# Research: existing capabilities

What the source Idea (PR #189, `ideas.specflow-engine.agent-workflow-entrypoints`) asks for, against
what exists on this branch on 2026-11-25. These are evidence, not scope. The Idea was written before
E6 was delivered.

## Delivered by E6 (ADR 0026)

- **Execute one Specification or Task step with a managed agent.** This is **Run with agent**
  (`adr.0026-agent-step-execution`, `architecture.runtime.agent-step-execution`).
- **Runtime starts the attempt with a trusted agent actor before dispatch.** It uses
  `startAgentAttempt`, the per-Turn capability and the per-user broker (D11). With a capability, the
  CLI routes writes to the broker and refuses owner commands.
- **Bounded context as references with digests, and `workflow context`** (D13).
- **Product protocol brief for a managed attempt Turn.** `features/agent-execution/brief/` renders
  the brief and its operations from the same CLI command table the routing reads. Managed Claude
  runs with setting sources off, so native skills and MCP are not loaded.
- **Finish as a proposal, with owner-only decisions waiting for Confirm** (D12, D17).

## Partial

- **Ad-hoc Turn of a Specification Session.** The write scope exists (D11b: documents of the home
  Specification only; Task drafts and finish need an attempt), but no protocol brief is rendered for
  such a Turn. Observed: the brief renderer takes attempt input only, and `feature.ts` derives the
  ad-hoc scope.

## Missing

- **Portable skill for an agent started outside Runtime.** The only skills in the repository are
  this repository's own generated `nevo-agents` profiles under `.claude/skills` and `.agents/skills`,
  not a product skill shipped to users. `nevo-specflow init` already writes shipped defaults into
  `.nevo/definitions`, and the offline CLI acts as `local:<os-user>`.
- **Create with an agent in project mode (L131).** It exists only in demo mode, where it opens an
  idle Session (`product.specflow.specification-creation`, Demo mode). The project Create allocates
  no Session (`ideas/specflow-ui/README.md`, open items).
- **External agent identity and durable external claims (L140).** Out of scope.
- **Prepare a complete Specification across steps (P103, automatic continuation).** Out of scope.

## Observation from this Specification

In attempt 1 of Gather requirements, the owner pressed **Start workflow** expecting the agent to
gather the requirements, and got an owner attempt. The owner files this Now-block wording as a
separate UI bug (decisions.md, D1).
