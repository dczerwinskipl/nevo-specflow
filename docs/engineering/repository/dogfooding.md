---
id: engineering.repository.dogfooding
type: engineering
title: Dogfooding the product build
status: current
read_when:
  - installing a local build of nevo-specflow to use it elsewhere
  - checking that a packaging change did not break the installed CLI
summary: >
  `pnpm dogfood:install` builds the real distributable, packs it, installs THAT tarball
  globally with pnpm, and smokes the installed `nevo-specflow`. It deliberately uses a
  tarball — not a workspace link — so it catches packaging problems a linked install
  would hide.
related:
  - engineering.repository.product-packaging
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
---

# Dogfooding the product build

```bash
pnpm dogfood:install
```

This is a **repository developer workflow**, not the future public
`nevo-specflow install` / `nevo-specflow update` (those are not designed yet — see
[repository-structure](../../architecture/repository-structure.md)). It:

1. runs the package-owned [`pnpm product:pack`](product-packaging.md) flow
   (self-bootstrapping — no prior `pnpm build` / `pnpm check` required);
2. `pnpm add -g <the packed tarball>` — on the **repository-pinned pnpm** (every child
   `pnpm` runs from the repo root, so Corepack never downloads "latest");
3. puts pnpm's global bin dir on `PATH` and runs the **real installed `nevo-specflow`
   executable shim** (the `.cmd` shim on Windows, the shell shim on Unix — not
   `node dist/bin.js`): `nevo-specflow --version` (must equal the packed version),
   `nevo-specflow --help` (must list the composed commands), and
   `nevo-specflow start --help` (must expose the real Runtime server command). The
   dogfood command deliberately does not start a long-running server. The packed-product
   smoke test owns the stronger start → HTTP probe → SIGTERM check;
4. fails with a diagnostic and a non-zero exit if pack or any smoke step fails.

## Why a tarball and not `pnpm link`

`pnpm link` / a `file:../nevo-specflow` dependency resolve through the workspace, so they
**hide** the exact failures a real install hits:

- a missing or wrong `files` allowlist (a needed file not shipped);
- a broken `bin` path, or `bin` pointing at `src`;
- a runtime dependency only present because of workspace hoisting;
- a `workspace:*` / `file:` dependency that cannot resolve off a registry;
- an `import` of a workspace-only module that was never bundled;
- invalid or drifted package metadata (version, `type`, `engines`).

Installing the packed `.tgz` is the only way to exercise the real distribution boundary,
so that is what `dogfood:install` does.

## After installing

`nevo-specflow` is on `PATH` via pnpm's global bin dir (`pnpm bin -g`). From any other
directory:

```bash
nevo-specflow --help
nevo-specflow --version
nevo-specflow start      # starts the configured long-running Runtime server
```

Remove it with `pnpm remove -g @nevo/specflow`.
