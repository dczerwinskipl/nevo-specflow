---
id: design-system.implementation.library-packaging
type: engineering
title: UI library packaging boundary
status: current
read_when:
  - changing @nevo/ui, @nevo/figma-core, or @nevo/figma-capture exports, build output, CSS, or peer dependencies
  - preparing reusable UI code for extraction or publication
summary: >
  Build and package contract for reusable UI and neutral Figma infrastructure without
  introducing a release model for the internal monorepo packages.
related:
  - design-system.principles.system-boundary
  - design-system.implementation.ownership-and-tooling
  - engineering.repository.product-packaging
---

# UI library packaging boundary

`@nevo/ui`, `@nevo/figma-core`, and `@nevo/figma-capture` remain private workspace packages.
Private status controls release policy; it does not justify source-only package exports.

Their package exports MUST point at generated `dist/` JavaScript and declarations. A package build
MUST produce and verify every exported target. React and React DOM are host-owned peer dependencies,
with local dev dependencies available for build and tests.

Production source in reusable packages MUST use the neutral TypeScript profile and MUST NOT see
Node globals. Node-powered generators, Vite configuration, and tests that need filesystem access
use separate Node-profile projects. `@nevo/figma-core` contains no React runtime; React capture
metadata belongs to `@nevo/figma-capture`.

`@nevo/ui/styles.css` is the explicit style entry. It contains the compiled semantic tokens,
Tailwind utilities used by the package, component-specific CSS, and the current global application
base. Consumers import it once. Splitting the global base/reset from component and token CSS is a
future compatibility project because it changes application rendering responsibility; do not create
an undocumented second CSS path in an unrelated component change.

TypeScript path aliases MAY continue to target source inside this monorepo for fast authoring and
cross-package checking. The package build is the proof that the external boundary does not depend on
those aliases.

This contract is separate from SpecFlow product packaging. Product packaging may bundle workspace
packages into one installable artifact; it does not define the future publication model for the UI
library.
