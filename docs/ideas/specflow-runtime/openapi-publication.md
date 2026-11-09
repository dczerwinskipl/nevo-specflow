---
id: ideas.specflow-runtime.openapi-publication
type: architecture
title: OpenAPI publication for the Runtime API
status: draft
scope: specflow
areas:
  - runtime
  - server
  - docs
  - security
tags:
  - openapi
  - api
  - fastify
  - typebox
read_when:
  - wanting an overview of the Runtime HTTP API shape
  - adding route schemas or changing Runtime endpoints
  - designing API documentation generation or CI drift checks
summary: >
  Proposal to generate an OpenAPI document from the existing Fastify TypeBox route schemas,
  serve it from Runtime under a restrictive visibility policy, commit a generated copy, and check
  it for drift in CI.
related:
  - ideas.readme
  - ideas.semantic-docs
  - architecture.runtime.endpoint-policy
---

# OpenAPI publication for the Runtime API

## Motivation

The owner wants direct visibility into the Runtime API shape (and of the planned documentation search
endpoint) without reading route code.

## Evidence

Runtime uses Fastify with `@fastify/type-provider-typebox`; route registrations already declare
TypeBox `schema` blocks including `response` (roughly 70 schema blocks across features at the time of
writing). An OpenAPI document can therefore be generated from what exists, not hand-written.

## Proposal

- Register `@fastify/swagger` and generate OpenAPI 3.1 from route schemas.
- Serve `GET /api/openapi.json`; optionally an interactive viewer (Swagger UI or Scalar).
- Visibility: available on loopback / development by default; under required authentication on an
  exposed Runtime it follows endpoint policy rather than being public.
- A command (for example `pnpm api:openapi`) writes `docs/reference/api/openapi.generated.json`.
  CI fails when the committed file is stale (like `docs:check`), so every API shape change is visible
  in pull request diffs.
- Routes without schemas show up as gaps; closing them is a follow-up, not a precondition.

## Execution plan

Temporary task decomposition: [OpenAPI publication execution plan](execution-plans/openapi-publication/README.md).

## Using it

Open the JSON in Swagger UI, Scalar, Bruno or Postman; or browse the viewer while
`nevo-specflow start` runs.
