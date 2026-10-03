---
id: engineering.repository.product-packaging
type: engineering
title: Product packaging
status: current
read_when:
  - building or changing how the nevo-specflow product is packed
  - adding code that ships inside @nevo/specflow
  - reviewing release artifacts or package metadata
summary: >
  @nevo/specflow owns the product artifact build. Package-owned packaging scripts create a
  self-contained CLI bundle and attribution metadata, then standard pnpm pack creates the tarball.
related:
  - adr.0011-product-artifact-packaging-and-pnpm-compatibility
  - engineering.repository.dogfooding
  - engineering.repository.releasing
---

# Product packaging

`@nevo/specflow` is distributed as one self-contained tarball. Source package boundaries remain
real; only the installed distribution is bundled. The current decision and pnpm compatibility
constraint are in [ADR 0011](../../architecture/decisions/0011-product-artifact-packaging-and-pnpm-compatibility.md).

## Ownership

Packaging belongs to the product package:

- `packages/specflow/src/` owns the public CLI shell;
- capability packages such as `@nevo/specflow-runtime` remain independent source boundaries;
- `packages/specflow/packaging/` owns distribution-only build logic;
- standard `pnpm pack` owns creation of the final npm-style archive.

There is no standalone `nevo-repo-product` workspace.

## Canonical commands

```bash
pnpm product:pack        # -> .artifacts/nevo-specflow-<version>.tgz
pnpm dogfood:install     # pack, global-install that tarball, smoke the installed command
```

Both work after `pnpm install --frozen-lockfile`; no prior repository build is required.

## Artifact pipeline

1. Build the release/version tool and Runtime workspace inputs required by the bundle.
2. Resolve the artifact version through the repository release model.
3. Bundle `packages/specflow/src/bin.ts`, internal capability packages, and runtime third-party
   dependencies with esbuild into one Node ESM executable.
4. Generate `THIRD_PARTY_NOTICES.txt` from esbuild's actual bundled inputs. Missing license
   information fails packaging.
5. Stage a minimal package manifest with the real version, `bin`, `engines`, README, LICENSE,
   notices, and no runtime/workspace dependencies.
6. Invoke the repository-pinned `pnpm pack` to write
   `.artifacts/nevo-specflow-<version>.tgz`.
7. CI installs that tarball outside the workspace and exercises the generated executable shim.

The custom code is intentionally limited to Nevo-specific distribution responsibilities. It does
not reimplement tarball generation or generic package-manager behavior.

## Package metadata

The source `packages/specflow/package.json` keeps `version: 0.0.0`; release/version state is not
duplicated there. The final staged manifest receives the resolved release version.

The packed artifact contains exactly:

```text
package/LICENSE
package/README.md
package/THIRD_PARTY_NOTICES.txt
package/dist/bin.js
package/package.json
```

The packed manifest has no `dependencies`, `devDependencies`, scripts, or `workspace:` values.

## Verification

`packages/specflow/test/packaging/` covers bundling, notices, version resolution, fresh-state packing,
dogfood behavior, build CLI wiring, and the shared package-builder contract.

`packages/specflow/test/packaging.smoke.test.ts` proves the actual distribution boundary:

- package the real artifact;
- install it into an isolated directory outside the workspace;
- execute `nevo-specflow` through the installed `.bin` shim;
- verify help/version/init/start/password hashing;
- start the Runtime on a real loopback port, call its HTTP API, and shut it down cleanly;
- assert exact archive contents, manifest invariants, and bundled dependency notices.

CI runs that installed-artifact smoke on Linux, Windows, and macOS.

## Release artifacts

An executing release builds the artifact for the exact tag selected by the release tool, writes a
SHA-256 checksum, creates a GitHub artifact provenance attestation, and uploads the tarball and
checksum to the GitHub Release. There is no npm publish.

An SBOM is not generated from the root lockfile because that would describe repository/dev
dependencies rather than the code actually embedded in the bundled artifact. Add an SBOM only when
it can faithfully represent the shipped bundle.
