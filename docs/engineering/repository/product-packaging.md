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
  @nevo/specflow owns the product artifact build. Package-owned packaging scripts create the
  self-contained CLI/Runtime bundle, embed the built UI, and generate attribution metadata before
  standard pnpm pack creates the tarball.
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

1. Build the release/version tool plus Runtime and UI workspace inputs.
2. Resolve the artifact version through the repository release model.
3. Bundle `packages/specflow/src/bin.ts`, internal capability packages, and runtime third-party
   dependencies with esbuild into one Node ESM executable.
4. Copy the Vite-built SpecFlow UI into `dist/ui`; `nevo-specflow start` serves that UI and the
   Runtime API from one local HTTP origin.
5. Generate `THIRD_PARTY_NOTICES.txt` from the CLI/Runtime bundle inputs plus the production
   dependency closure of the browser UI. Missing license information fails packaging.
6. Stage a minimal package manifest with the real version, `bin`, `engines`, README, LICENSE,
   notices, and no runtime/workspace dependencies.
7. Invoke the repository-pinned `pnpm pack` to write
   `.artifacts/nevo-specflow-<version>.tgz`.
8. CI installs that tarball outside the workspace and exercises the generated executable shim.

The custom code is intentionally limited to Nevo-specific distribution responsibilities. It does
not reimplement tarball generation or generic package-manager behavior.

## Package metadata

The source `packages/specflow/package.json` keeps `version: 0.0.0`; release/version state is not
duplicated there. The final staged manifest receives the resolved release version.

The packed artifact contains the fixed product files plus the Vite-generated UI assets:

```text
package/LICENSE
package/README.md
package/THIRD_PARTY_NOTICES.txt
package/dist/bin.js
package/dist/ui/index.html
package/dist/ui/assets/...
package/package.json
```

The packed manifest has no `dependencies`, `devDependencies`, scripts, or `workspace:` values.

## Verification

`packages/specflow/test/packaging/` covers bundling, notices, version resolution, fresh-state packing,
dogfood behavior, build CLI wiring, and the shared package-builder contract.

`packages/specflow/test/packaging.smoke.test.ts` proves the actual distribution boundary. By
default it builds the package itself; release CI can point it at a prebuilt candidate so several
runners verify the exact same bytes.

It verifies:

- package the real artifact (or consume the one supplied release candidate);
- install it into an isolated directory outside the workspace;
- execute `nevo-specflow` through the installed `.bin` shim;
- verify help/version/init/start/password hashing;
- start SpecFlow on a real loopback port, verify the root UI, client-route fallback, and HTTP API,
  then shut it down cleanly;
- assert the archive surface, manifest invariants, and CLI/UI dependency notices.

CI runs that installed-artifact smoke on Linux, Windows, and macOS.

## Release artifacts

Release validation first resolves the exact tag, then builds that version **once**. The resulting
`.tgz` is stored as a workflow artifact and the same file is downloaded and installed by Linux,
Windows, and macOS smoke jobs. Only after all three pass may execute mode create/complete the tag and
GitHub Release. The publish job re-downloads those tested bytes, verifies the embedded package
version against the planned tag, writes SHA-256, attests that tarball, and uploads the tarball plus
checksum. There is no npm publish.

An SBOM is not generated from the root lockfile because that would describe repository/dev
dependencies rather than the code actually embedded in the bundled artifact. Add an SBOM only when
it can faithfully represent the shipped bundle.
