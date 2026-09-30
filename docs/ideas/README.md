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
  Non-authoritative implementation backlog for ideas worth evaluating during migration.
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

## Current packages

- [SpecFlow Runtime / AI adapter hardening](specflow-runtime/ai-adapters/README.md)
