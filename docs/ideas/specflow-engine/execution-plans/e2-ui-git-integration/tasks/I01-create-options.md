---
id: ideas.specflow-engine.plan-02-ui-git-integration.I01
type: engineering
title: E2.I01 — Authorized create-options read projection
status: draft
scope: specflow
areas: [runtime, cli, security, testing]
tags: [execution-task, temporary, e2]
read_when:
  - implementing E2.I01
summary: >
  Provide one Engine-owned read model and authorized HTTP endpoint for the Specification
  creation form without exposing mutation authority or workstation paths.
related:
  - ideas.specflow-engine.plan-02-ui-git-integration
---

# E2.I01 — Create options read API

**Mode:** SOLO, suitable to execute before I02. **Branch:** existing PR #53, no separate PR. **Dependency:** current E2.T17 and Q hardening. **No UI implementation.**

## Existing evidence / source

- `packages/specflow-contracts/src/specs/create.ts`: HTTP Create `target` union `existing(workspaceId)` | `new-worktree(baseRef?, branch?)`; omission selects **primary**, not necessarily `main`.
- `packages/specflow-runtime/src/features/specs/create/endpoint.ts`: authorized `POST /api/specs`, project Create capability, no engine => typed 503.
- `packages/specflow-engine/src/project/workspace-registry*`: verified Project Home, registered primary/linked workspaces, canonical Spec bindings.
- `packages/specflow-engine/src/version-control/worktrees/{config,policy,git-adapter}.ts`: policy enabled/default baseRef/branchPattern, Git capability and ref inspection.
- Existing overview/Spec HTTP authorization, Engine-only reads and strict typed contracts are precedents. Check **current source**, not copied names.

## Required behavior

1. Add a single read-only Engine query/projection and Runtime `GET /api/specs/create-options`, using feature-owned contracts; centralize data selection and verification in Engine rather than letting HTTP inspect Git directly.
2. Return a verified **primary workspace** (ID, current local branch or explicit unavailable state); available registered existing linked workspaces (ID, branch, managed/kind, number of Specs bound, ability to target for Create), and Git new-worktree availability with a reason when unavailable. Include **project-configured** default baseRef and the configured project integration target when available.
3. Provide the selectable, validated **local** branch/ref candidates needed by the UI for base selection. Distinguish existing checked-out registered branches from references with no supported target workspace. Do not claim a ref is a valid integration **destination** simply because it exists. I02 extends selectable destination candidates and metadata.
4. Preserve honest states: detached/unavailable/foreign/moved/unmanaged worktree, Git disabled/unavailable, dirty checkout, missing configured target. Read-only response is a snapshot, **not** an admission reservation or mutation readiness guarantee. Engine Create/Close MUST independently revalidate.
5. No absolute local roots, raw Git errors, private registry/journal contents, provider/session data, unauthorized spec titles/IDs, or workstation secrets in the DTO. Use stable IDs and sanitized reason codes. Count canonical bindings only; don't confuse inherited manifests with occupants.
6. Apply project Create capability before any caller-visible project metadata; `401/403` before enumeration, `503` for no real Engine, schema-defined errors. Preserve role/scope rules; do not weaken `POST` authorization.
7. No Git mutation, checkout, branch creation, repo fetch, index refresh or long Git subprocess under Project Home control lock. No fallback demo records or independent UI-side mutation rules.

## Acceptance tests

- With primary on `develop`, response labels the actual branch (not hardcoded `main`), project baseRef default and configured integration target distinctly.
- New-worktree enabled/disabled and missing Git are represented truthfully. Unavailable linked workspace is not offered as selectable; reason is observable safely.
- Three Specs bound to one registered linked checkout appear as **one** workspace option with `specCount: 3`; unbound primary Specs are counted as specified by authoritative discovery/registry rules, not guessed.
- Anonymous and unauthorized (viewer/spec-scoped-only) requests reveal no workspace/branch list; no-Engine => typed unavailable; authorized successful request is schema-valid and `Cache-Control: no-store`.
- Real Git/read test establishes that no branch/HEAD/index, registry, journal or manifest is mutated. Concurrent Create/Close gives a safe consistent read or explicit unavailable/conflict, never fabricated completeness.
- Existing Create HTTP/CLI and cross-transport tests remain green; demonstrate UI can map selected IDs into the **unchanged** Create API.

## Deliverables / limits

Document final response schema and mapping for UI integration; add Engine, contracts, Runtime and tests under their owning features. Do not build React UI, add per-worktree target storage, enable branch-only Create, or extend Close here. Report exact HTTP requests/responses and remaining I02 decisions.
