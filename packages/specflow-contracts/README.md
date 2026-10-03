# `@nevo/specflow-contracts`

Shared, platform-neutral SpecFlow contracts consumed by Runtime and UI.

## Ownership

This package owns product-facing contract semantics that must be identical across application
surfaces:

- resource and capability identifiers;
- request/response schemas;
- TypeScript types inferred from those schemas.

For HTTP payloads, the TypeBox schema is the source of truth and the exported TypeScript type is
`Static<typeof Schema>`. Do not duplicate a DTO interface in Runtime and then prove assignability
with compatibility assertions.

The package must remain platform neutral:

- no Fastify, React, Node filesystem/process APIs, Node builtin module imports, or provider SDKs;
- no Runtime configuration or persistence concerns;
- dependencies must themselves be suitable for neutral product code.

The shared package builder enforces the neutral profile and rejects Node builtin imports from neutral
package source/output; this is a build contract, not only a documentation convention.

Runtime may use these schemas directly with Fastify Type Providers. UI/client code may use the same
types and, where useful, schemas without depending on Runtime.
