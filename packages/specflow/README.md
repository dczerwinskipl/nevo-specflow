# `@nevo/specflow`

The public **Nevo SpecFlow** product package. It ships the single installable
`nevo-specflow` CLI and acts as the composition root for product capabilities.

## Implemented CLI

```bash
nevo-specflow --help
nevo-specflow --version
nevo-specflow init
nevo-specflow start
nevo-specflow auth hash-password --password-stdin
```

`init` owns repository bootstrap and composes capability initialization. Runtime owns the server/auth configuration contribution it returns; the product shell writes that contribution to `.nevo/config.yaml` and ignored `.nevo/local/config.yaml` without duplicating Runtime config semantics. `start` starts the configured long-running Runtime HTTP server and remains active until
shutdown. Both `init` and `start` resolve the Git repository root through the product shell, so
running either command from a nested repository directory uses the same project configuration.
The auth utility generates the supported password hash from one password line
read from stdin, keeping the plaintext password out of command arguments.

Command semantics belong to their capability verticals. The public package owns only the
root CLI conventions, version/output behavior, process lifecycle, and command composition.
The exact public surface is tracked in
[`docs/reference/cli/nevo-specflow-contract.md`](../../docs/reference/cli/nevo-specflow-contract.md).

## Distribution

The product ships as one self-contained bundle. Repository packages such as
`@nevo/specflow-runtime` are build-time workspace boundaries and are bundled into
`@nevo/specflow`; an installed product does not depend on the repository workspace.

The canonical artifact is produced by `nevo-repo-product`. See
[product packaging](../../docs/engineering/repository/product-packaging.md) and
[dogfooding](../../docs/engineering/repository/dogfooding.md).
