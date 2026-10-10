---
id: ideas.specflow-engine.acceptance
type: reference
title: Engine worktree foundation acceptance criteria
status: draft
scope: specflow
areas: [testing, docs, cli, workflow, runtime]
tags: [acceptance, proof-of-concept, requirements]
read_when:
  - deciding whether the engine/worktree PoC proved its architecture
  - freezing documentation or approving migration of legacy workflow
summary: >
  Reviewable acceptance gates for an offline-capable Engine, real Specification creation and
  optional worktree isolation, with evidence and deferred-work conditions.
related:
  - ideas.specflow-engine
  - ideas.specflow-engine.spec-creation
  - ideas.specflow-engine.test-plan
  - ideas.specflow-engine.decisions
---

# Acceptance criteria (proposal)

These are **candidate** PoC acceptance gates, not currently adopted product requirements. Claim PASS only with links to real tests, commits and runtime results, not an assertion by an agent.

## Foundation acceptance

- **AC-01, offline CLI:** With Runtime stopped, a new CLI process can initialize/resolve project and create/list/read a Specification; future minimal Engine workflow inspect/start can run without HTTP.
- **AC-02, common operation:** CLI and HTTP adapters invoke the same underlying Specs creation use case; neither duplicates manifest/Git/journal mutation algorithm.
- **AC-03, correct current baseline:** Work is based on latest `main` at implementation start. Open PR #45 is reviewed for contract compatibility but not required as source/base.
- **AC-04, thin HTTP:** Auth/authorization occurs before mutation; Runtime returns real Engine data and honest unavailable/error status.
- **AC-05, title-only:** UI/CLI human creation requires only title; derives slug/id without asking for an extra technical ID.
- **AC-06, Git disabled:** User cannot request worktree when Git capability disabled/unavailable; no mutation occurs.
- **AC-07, worktree:** When enabled, create yields a verified branch, linked worktree, canonical manifest and registry binding without checkout of primary.
- **AC-08, stable identity:** `specId`, `projectId`, `workspaceId`, `executionId` are distinct; branch/path/Session IDs cannot substitute.
- **AC-09, discovery:** CLI from primary or registered worktree resolves the same project and canonical location mapping.
- **AC-10, deduplication:** Bound spec appearing in primary and worktree is listed once from bound source; unavailable binding does not fall back silently.
- **AC-11, local state:** Machine-owned JSON registry/journal and human-owned YAML manifests/config have explicit schema/version and one writer/owner.
- **AC-12, concurrency:** Separate OS processes cannot silently race into double spec creation, lost registry updates or concurrent conflicting workspace writers.
- **AC-13, external execution:** Workflow coordination can persist across short CLI process lifetime without requiring managed Runtime Session. No fake Session is manufactured.
- **AC-14, correct liveness:** Dead CLI PID or elapsed time alone does not authorize taking another external agent's workspace claim.
- **AC-15, recovery:** Crash between worktree provisioning, manifest and registry is reconciled idempotently; no duplicate branch, spec, or destructive rollback.
- **AC-16, separation:** Import rules enforce Engine independence from HTTP/Commander/Runtime providers/UI; product remains a single npm artifact.
- **AC-17, security:** File references are workspace-bounded, symlink/replacement/branch collisions fail closed, HTTP permissions prevent unauthorized mutations.
- **AC-18, demo isolation:** Production API uses actual Engine storage; explicit Runtime Demo cannot write production files.
- **AC-19, observability:** Runtime observes externally persisted workflow/spec changes as durable facts; provider conversation details remain absent unless Runtime owns them.
- **AC-20, documented limits:** No implicit guarantees of network filesystem locking, physical sandbox isolation, multi-host execution or full worktree cleanup if not implemented.

## Owner review / proof

Required artifacts:

1. One reproducible local walkthrough of offline CLI creation (primary and linked worktree) and CLI launched **from** a linked worktree.
2. Real HTTP integration showing same spec without fixture fallback and with denied unauthorized mutation.
3. Separate process contention/restart demonstration; kill after Git stage and recover successfully.
4. Filesystem tree + Git worktree list/branch evidence + registry/journal before and after.
5. Import dependency check and packaged product smoke test.
6. Cross-platform results for supported Windows/POSIX; unresolved skipped critical tests are recorded as **not accepted**.
7. One explicit list of decisions resolved by owner versus still open; no automatic normative freeze.

## Not required for PoC

- Full migrated deterministic workflow, batch scheduling, all providers, AI session UI, task review gates, GitHub/GitLab PR merge, full archive/finalize, automatic worktree cleanup, an in-browser IDE, multi-project/multi-host synchronization.
- Rich UI creation wizard if direct API+CLI prove architecture; if shown, preserve title-only and optional worktree UX without faking API.
- Attaching a manually launched provider-native conversation to Runtime Sessions.

## Promotion gate

Once AC-01 through AC-20 are evaluated, promote supported invariants to the owning architecture and engineering documents. Update ADR 0012 only if separate Engine source package wins the package-boundary experiment. Adjust Runtime ownership/configuration and workflow trusted executor wording only after explicitly deciding Engine authority. Keep this dossier draft or mark appropriately superseded; do not leave two competing current descriptions.
