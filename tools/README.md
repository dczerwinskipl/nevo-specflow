# `tools/`

Repository-internal tooling. **Never** published and never a Nevo SpecFlow product API.

| Directory | Purpose |
| --- | --- |
| `tools/docs` | Deterministic documentation discovery/index and ADR authoring. |
| `tools/agents` | Canonical agent-profile validation and provider projections. |
| `tools/release` | Version lines, promotions, tags and GitHub Release orchestration. |
| `tools/github` | Repository governance reconciliation and verification. |
| `tools/figma-project` | Repository-local design integration tooling. |

Product-specific build/packaging logic does not live here; it belongs to
`packages/specflow/build/` because it exists solely to produce `@nevo/specflow`.

Everything under `tools/*` participates in the pnpm/Turbo workspace only when it has independent
repository-development value.
