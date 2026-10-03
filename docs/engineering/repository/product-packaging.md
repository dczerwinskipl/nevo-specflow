---
id: engineering.repository.product-packaging
type: engineering
title: Product packaging
status: current
read_when:
  - building or changing how the nevo-specflow product is packed
  - adding a package that ships inside @nevo/specflow
  - reviewing @nevo/specflow package metadata
  - wiring a CI or release job that needs the product tarball
summary: >
  How the Nevo SpecFlow product is turned into one installable artifact:
  nevo-repo-product bundles the nevo-specflow entry, the internal workspace capability
  packages and commander with esbuild, then packs on the pinned pnpm to produce
  .artifacts/nevo-specflow-<version>.tgz (with a THIRD_PARTY_NOTICES.txt). Source
  package boundaries stay real — the shell composes, each vertical owns its CLI
  adapter — only the distribution is a single file.
related:
  - adr.0006-product-ships-as-a-single-bundled-artifact
  - engineering.repository.dogfooding
  - engineering.repository.releasing
  - architecture.repository-structure
---

# Product packaging

`@nevo/specflow` (the public `nevo-specflow` CLI) is distributed as **one self-contained
tarball**. See [ADR 0006](../../architecture/decisions/0006-product-ships-as-a-single-bundled-artifact.md)
for why.

## Layout

| Package                                                                     | Role                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/specflow`](../../../packages/specflow/README.md)                 | `@nevo/specflow` — the CLI **shell**: the root `nevo-specflow` program, `--version`, global flags/output/exit conventions, and command **composition**. Thin `bin.ts`.                                                                         |
| [`packages/specflow-runtime`](../../../packages/specflow-runtime/README.md) | `@nevo/specflow-runtime` — the Runtime **vertical**: the application capability at `.` (`startRuntime()`, no Commander) and capability-owned command adapters at `./cli` (`start`, auth utilities). `private: true`, bundled into the product. |
| [`tools/product`](../../../tools/product/README.md)                         | `nevo-repo-product` — the **one** packaging entrypoint (`bundle` · `pack` · `dogfood`).                                                                                                                                                        |

**Ownership.** The shell composes capability-owned commands; it does not define a
command's name, options, help or subcommands — the vertical does.
Commander is imported only by the vertical's `./cli` adapter; its
framework-independent capability/runtime does not import Commander — the same way a feature owns its HTTP routes while the server root
only mounts them. The source dependency `@nevo/specflow → @nevo/specflow-runtime` is a
real `workspace:*` edge; the single-artifact form is only the _distribution_.

## The canonical command

```bash
pnpm product:pack        # -> .artifacts/nevo-specflow-<version>.tgz
```

`pnpm product:pack` runs `nevo-repo-product pack`, which is the only implementation of
"make the product artifact". `pnpm dogfood:install` and any future CI / release job call
the same function — there is no second pack path.

Steps:

0. **Self-bootstrap.** The root scripts are
   `pnpm --filter nevo-repo-product build && node tools/product/dist/bin.js …`, so
   `pnpm product:pack` / `pnpm dogfood:install` work straight after
   `pnpm install --frozen-lockfile` — no prior `pnpm build` / `pnpm check`, no committed
   `dist`.
1. **Build the inputs, scoped.** `pnpm --filter nevo-repo-release build` and
   `pnpm --filter @nevo/specflow-runtime... build` — Runtime and its transitive workspace
   dependencies run their own builds only, never a global `turbo run build`. Reusable product
   packages use the ADR 0009 library builder; repository tools such as release remain plain
   `tsc`. Packaging can therefore run inside `turbo run test` without a repo-wide pre-build.
2. **Resolve the version** from `nevo-release version` (the same command
   `pnpm version:print` uses — the repository's canonical channel/SemVer model). It is
   validated as a legal npm version.
3. **Bundle the distribution** with esbuild (`nevo-repo-product bundle`): the `nevo-specflow` entry +
   `@nevo/specflow-runtime` (`.` and `./cli`) + `commander`, into one ESM `dist/bin.js`
   with a `#!/usr/bin/env node` banner and `NEVO_SPECFLOW_VERSION_INJECTED` defined.
4. **Write minimal metadata** into a scratch stage: `name`, the resolved `version`,
   `bin`, `type`, `license`, `engines`,
   `files: ["dist", "THIRD_PARTY_NOTICES.txt", "README.md", "LICENSE"]` — **no
   `dependencies`**, no `devDependencies`, no `scripts`.
5. **Write `THIRD_PARTY_NOTICES.txt`** from esbuild's actual bundled inputs. For
   each embedded third-party package, copy its installed license text verbatim when
   present. If upstream ships only `package.json` license metadata, preserve that
   declaration plus available author/source metadata. If neither exists, packaging
   fails closed. Build-only tools (esbuild, tsc) are **not** listed.
6. **`pnpm pack`** the stage into `.artifacts/` (git-ignored). Every child `pnpm` — this
   pack, the input builds, the isolated install in the smoke test, the global
   `dogfood` install — runs with `cwd` = the repository root (which carries
   `packageManager`) and targets other directories with `--dir`, so Corepack always uses
   the **repository-pinned pnpm**, never "latest". The tarball name is deterministic:
   `nevo-specflow-<version>.tgz`.

## Package build vs distribution bundle

ADR 0009 owns source-package compilation: reusable product packages bundle their JavaScript and
declaration surfaces with the generic library builder, with neutral and Node-only profiles made
explicit. That package build does **not** create the product artifact.

The separate `nevo-repo-product bundle` step defined by ADR 0006 is the only place that creates
the final self-contained public CLI file and intentionally crosses workspace package boundaries.

## Package-metadata rules for `@nevo/specflow`

Even though nothing is published, the source `package.json` must stay coherent:

| Field          | Rule                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`      | Stays `0.0.0` in source — **never hand-edited per release**. The real version is injected at pack time.                                                                                                       |
| `bin`          | `nevo-specflow` → `./dist/bin.js` (the built/bundled file, never `src`).                                                                                                                                      |
| `files`        | Staged as `["dist", "THIRD_PARTY_NOTICES.txt", "README.md", "LICENSE"]`. Tests, `src`, tsconfig, turbo config never ship.                                                                                     |
| `dependencies` | Empty in the packed manifest. `commander` is compiled in, so it is a **`devDependency`** of the source `@nevo/specflow` (and a real `dependency` of `@nevo/specflow-runtime`, whose `./cli` adapter uses it). |
| `type`         | `module`.                                                                                                                                                                                                     |
| `engines.node` | `>=24.20.0 <25` — kept identical to the repository root and to the only Node version CI tests. The staged manifest copies it verbatim.                                                                        |

Verify contents before trusting a change:

```bash
pnpm product:pack
tar -tzf .artifacts/nevo-specflow-*.tgz
#  package/LICENSE  package/README.md  package/THIRD_PARTY_NOTICES.txt
#  package/dist/bin.js  package/package.json      (and nothing else)
tar -xzOf .artifacts/nevo-specflow-*.tgz package/package.json
```

## What is proven, and where

| Layer               | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| capability          | `packages/specflow-runtime/test/runtime.test.ts` — starts the real HTTP server, probes the auth session API, and closes it explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CLI adapter         | `packages/specflow-runtime/test/command.test.ts` — Runtime command adapters cover `start` lifecycle and the auth password-hash utility; the capability module does **not** import Commander.                                                                                                                                                                                                                                                                                                                                                                              |
| CLI shell           | `packages/specflow/test/cli.test.ts` — `createProgram` composes capability commands; `--help`, `--version`, `start`, auth utility routing, and unknown-command behavior are covered.                                                                                                                                                                                                                                                                                                                                                                                      |
| bundler             | `tools/product/test/bundle.test.ts` — esbuild injects the version, emits a runnable ESM file with the shebang, inlines a sibling module.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| fresh clone         | `tools/product/test/fresh-state.test.ts` — after deleting `tools/product/{dist,.tsbuild}` and clearing `.artifacts`, `pnpm product:pack` still produces a tarball; the effective pnpm is the pinned one.                                                                                                                                                                                                                                                                                                                                                                  |
| **packed artifact** | `packages/specflow/test/packaging.smoke.test.ts` — `pack` (pinned pnpm) → install the tarball into an **isolated prefix outside the workspace** (`pnpm --dir <prefix> --ignore-workspace add`) → run the installed `nevo-specflow` **through its `.bin` shim on `PATH`**: help/version, password-hash provisioning, real `start` → HTTP `/api/auth/session` probe → SIGTERM clean shutdown, and unknown-command behavior; assert the exact tarball file list, manifest and representative bundled dependency notices. Nothing resolves through the repo's `node_modules`. |

## Future GitHub Release compatibility

`Release` is **not** changed to attach the tarball in this pass. When it is, it calls
`nevo-repo-product pack` — the same entrypoint — rather than re-implementing packing.
There is still no npm publish.
