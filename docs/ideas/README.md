---
id: ideas.readme
type: hub
title: Implementation ideas
status: current
scope: specflow
areas:
  - docs
read_when:
  - collecting implementation ideas before they become approved architecture or specifications
  - looking for hardening follow-ups to apply while migrating legacy capabilities
summary: >
  Proposals: an implementation backlog of ideas worth evaluating during migration.
  Items here are deliberately separated from current architecture and become normative only
  after they are promoted into the appropriate architecture, engineering, product, or
  specification documents.
related:
  - adr.0007-documentation-architecture-and-taxonomy
  - architecture.ai.provider-boundary
  - architecture.runtime.ownership-and-lifecycle
---

# Implementation ideas

This namespace is a **proposal backlog**, not an additional source of truth.

Default `pnpm docs:context` discovery excludes this namespace. Use `pnpm docs:find` or exact
`pnpm docs:get` IDs when an agent is intentionally evaluating or migrating an idea.

Documents under `docs/ideas/**` capture enough evidence and design direction that a later
specification or implementation agent should not need to rediscover the original debugging
conversation. Child documents remain `status: draft` proposals. They may contain concrete candidate
contracts, provider signatures, test cases, and migration notes, but they do not become requirements
until the relevant conclusion is promoted into an authoritative current document.

When an idea uses words such as "must", "should", "expected", or "target", read them as proposal
language unless the sentence explicitly cites an existing authoritative rule. Current architecture,
product, engineering, and reference documents always win on conflict.

When an idea is accepted for implementation:

1. reconcile it with current code and current provider versions;
2. promote durable rules into their authoritative architecture/engineering/reference home;
3. create an implementation-ready specification or task plan as appropriate;
4. remove or mark the idea as superseded rather than leaving competing active guidance.

A merged implementation PR does not by itself prove that a whole idea is delivered. Before any part
of an idea is removed, give each part exactly one disposition:

- **implemented** — described in a current contract that states the delivered scope, including
  any limited or stand-in behaviour;
- **superseded** — replaced by a concrete decision, which the remaining text names;
- **still open** — kept here as backlog.

A current product, architecture or reference document describes only what is implemented; planned
behaviour next to it is marked as such and linked to its open idea. Decision records kept here
(rationale, rejected alternatives, follow-ups) stay `status: draft` and are proposals; a
rationale whose premise no longer holds is marked superseded or removed.

## Current packages

- [Offline Engine, CLI/Runtime boundaries, and Git worktrees](specflow-engine/README.md)
- [Multi-project hosting, Docker, and future cross-project work](multi-project-hosting.md)
- [Authorization follow-ups](authorization/README.md)
- [SpecFlow Runtime / AI adapter hardening](specflow-runtime/ai-adapters/README.md)
- [SpecFlow Runtime / provider capability backlog](specflow-runtime/provider-migration-plan.md)
- [SpecFlow Runtime / Session backend gaps](specflow-runtime/session-v10-backend-readiness.md)
- [SpecFlow Runtime / server-side Work history filter](specflow-runtime/work-history-server-filter.md)
- [Developer workspace / code inspection and IDE integration](developer-workspace/README.md)
- [SpecFlow UI / open screen and component ideas](specflow-ui/README.md)
- [Semantic documentation search follow-ups](semantic-docs/README.md)

Decision records (proposals) with open follow-ups:
[Session association registry](specflow-runtime/session-association/README.md),
[Project-mode Specification Overview](specflow-runtime/project-mode-spec-overview/README.md).
