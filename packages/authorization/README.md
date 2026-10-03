# `@nevo/authorization`

Framework-independent scoped capability authorization primitives for Nevo products.

The package knows subjects, resources, capabilities, roles, assignments, and string-valued scopes.
It does not know SpecFlow resource names, HTTP, configuration files, persistence, React, or Fastify.

## Construction boundary

`createAuthorization()` validates and snapshots caller-owned definitions. Runtime `readonly`
annotations are not treated as an immutability boundary: caller mutation after construction must not
change authorization decisions.

Resource/capability and role identifiers are canonical identifier segments rather than arbitrary
display text. Product-specific scope hierarchy remains outside this package.
