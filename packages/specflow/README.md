# `@nevo/specflow`

The public **Nevo SpecFlow** product package. It ships the `nevo-specflow`
command-line interface and acts as the CLI composition root.

|                |                          |
| -------------- | ------------------------ |
| **Product**    | Nevo SpecFlow            |
| **Package**    | `@nevo/specflow`         |
| **CLI**        | `nevo-specflow`          |
| **Runtime**    | `@nevo/specflow-runtime` |
| **Repository** | `nevo-specflow`          |

## Implemented CLI surface

```bash
nevo-specflow --help
nevo-specflow --version
nevo-specflow start
```

`nevo-specflow start` is owned by
[`@nevo/specflow-runtime/cli`](../specflow-runtime/README.md) and composed here.
It currently proves the Runtime boundary and prints a deterministic bootstrap marker;
the real long-lived Runtime is not migrated yet.

The shell owns the root program, version/global conventions, output/error/exit
behavior, and command composition. Capability verticals own their command semantics.

## Distribution

The distributable remains a **single self-contained bundle**. `nevo-repo-product`
bundles `@nevo/specflow`, `@nevo/specflow-runtime`, and Commander into
`dist/bin.js`; consumers install one artifact with no workspace dependency.

See [product packaging](../../docs/engineering/repository/product-packaging.md) and
[dogfooding](../../docs/engineering/repository/dogfooding.md).
