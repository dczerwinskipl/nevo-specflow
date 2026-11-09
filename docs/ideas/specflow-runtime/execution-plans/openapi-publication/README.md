---
id: ideas.specflow-runtime.execution-plans.openapi-publication
type: engineering
title: 'Temporary execution plan — OpenAPI publication for the Runtime API'
status: draft
scope: specflow
areas: [runtime, server, security, docs, testing]
tags: [execution-plan, temporary, openapi, fastify, typebox]
read_when:
  - implementing OpenAPI publication for the Runtime HTTP API
  - selecting the next dependency-complete task of the OpenAPI publication feature
summary: >
  Decomposition of the OpenAPI publication idea into two reviewable tasks delivered in one pull
  request: generation and serving of the document by Runtime, then the committed generated copy,
  its CI drift check and the promotion of the durable rules into reference and engineering docs.
related:
  - ideas.specflow-runtime.openapi-publication
  - ideas.semantic-docs.execution-plan
  - architecture.runtime.endpoint-policy
  - architecture.runtime.authorization
  - engineering.repository.ci
---

# OpenAPI publication — execution plan

Source idea: [OpenAPI publication for the Runtime API](../../openapi-publication.md). This plan owns
only sequencing, scope boundaries and review gates. It is delivered as **one pull request**
(owner rule: prerequisites go into the same PR, no side PRs) and lands **before** the
[semantic documentation search plan](../../../semantic-docs/execution-plan/README.md), whose Runtime
endpoint becomes visible through it.

## Scope and result

Runtime registers OpenAPI generation once in its composition root, derives an OpenAPI 3.1 document
from the TypeBox route schemas that already exist (no hand-written schema), and serves it at
`GET /api/openapi.json` under the visibility decided in [Open decisions](#open-decisions). A
repository command writes the same document to `docs/reference/api/openapi.generated.json`; CI fails
when the committed copy is stale, so every API shape change shows up in pull request diffs. Routes
without schemas are reported as gaps; closing them is out of scope.

Out of scope: an interactive viewer (see A-D2), closing schema gaps, contextual help UI, any change
to route behavior.

## Task graph

| Task                                                                        | Dependencies | Kind / implementer    | Planning readiness                                   |
| --------------------------------------------------------------------------- | ------------ | --------------------- | ---------------------------------------------------- |
| [A01 Runtime OpenAPI generation and endpoint](tasks/A01-runtime-openapi.md) | None         | backend / implementer | Ready for execution once A-D1 is answered (planning) |
| [A02 Committed document, drift check and docs](tasks/A02-drift-and-docs.md) | A01          | general / implementer | Planned, dependent                                   |

`A01 -> A02` is acyclic. Profiles mean `nevo-agents:implementer`; independent review uses
`nevo-agents:reviewer`. These are planning metadata, not workflow manifest keys.

## Role separation and review gates

Each task is implemented by its own implementer agent and reviewed by a **separate** reviewer agent
that did not implement it. A failed gate stops dependent work.

1. **Gate A01** — composition-root placement, visibility/authorization of the new route, the
   document reflecting the project-mode route surface, no route behavior change, deterministic
   output.
2. **Gate A02 (whole PR)** — drift check really fails on a stale file, the generated file is
   byte-stable across Windows and Linux, durable rules live in authoritative docs and the idea is
   marked superseded.

## Verification policy

Windows workstation: run only the targeted test files named in each task. Full package suites and
the CI drift job run on Linux/CI. Every task reports actual PASS/FAIL/SKIP per command.

## Open decisions

| ID   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                      | Recommendation                                                                                                                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-D1 | Visibility of `GET /api/openapi.json`. The idea says "loopback/development by default; under required authentication follows endpoint policy". Endpoint policy only defines request admission (rate limit) and says authorization is separate; Runtime has no "development" mode, and `authentication.mode=required` without TLS is already restricted to loopback. So the idea's wording does not map onto an existing rule. | Treat the document like any other Runtime read: `request.authz.requireAccess()` (an authenticated principal, or the trusted local identity in trusted local mode), shared default rate limit, `Cache-Control: no-store`, no new capability. A dedicated capability is only worth it if non-admin principals must not see the API shape. |
| A-D2 | Ship an interactive viewer (Swagger UI / Scalar) in this PR.                                                                                                                                                                                                                                                                                                                                                                  | No. JSON only; external tools (Bruno, Postman, Scalar desktop) open it. A viewer adds bundled static assets, CSP considerations and third-party notices for little gain.                                                                                                                                                                |
| A-D3 | Whether demo-only routes (`/api/demo/...`) appear in the committed document.                                                                                                                                                                                                                                                                                                                                                  | No. The committed document is the project-mode surface; demo seams are hidden from the specification. The served document reflects the running Runtime's own surface minus hidden routes.                                                                                                                                               |

No ADR is planned for this feature: the durable rules (served endpoint, generated reference file,
drift check) are reference and CI facts, not a cross-cutting architecture decision. If the reviewer
or owner disagrees, that is a gate-A02 finding, not an implementer decision.

## Exit and cleanup

Both tasks accepted, the CI drift job green on Linux, the idea marked `superseded` with links to the
authoritative reference and CI documents. Retire this plan after merge.
