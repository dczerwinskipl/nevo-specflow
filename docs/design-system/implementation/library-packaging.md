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

## Typography and shipped fonts

The design system ships its sans-serif face. Inter (variable, weights 100-900, SIL OFL 1.1) is
bundled with `@nevo/ui`; consumers do not install, link or fetch it separately, and no CDN or
runtime network request is involved. `--font-sans` in `design-system.css` names `Inter` first, so
text measures the same on every machine instead of falling back to Segoe UI, DejaVu Sans or
another system font. Geometry-sensitive stories and tests may rely on this.

- The `@font-face` rules live in `packages/nevo-ui/src/design-system/fonts.css`. They cover the
  Latin and Latin Extended subsets (Latin Extended carries the Polish diacritics), use
  `font-display: swap`, and rely on `unicode-range` so a subset is fetched only when a glyph needs it.
- The woff2 files come from the exact-pinned `@fontsource-variable/inter` dev dependency.
  `scripts/ship-fonts.mjs` copies them to `dist/fonts/` after `vite build` and makes
  `dist/styles.css` start with `@import './fonts/inter.css';`. Vite library mode would otherwise
  inline the fonts as base64 into `styles.css`; `verify-package.mjs` fails the build if it does.
- Consumers import `@nevo/ui/styles.css` as before; their Tailwind/Vite pipeline resolves the import
  and emits the font files as hashed assets.
- `--font-mono` is a system monospace stack and is intentionally not shipped.
- To add a script (for example Cyrillic) or an italic, extend `fonts.css` with the matching files
  from the same package; do not link a hosted font.

TypeScript path aliases MAY continue to target source inside this monorepo for fast authoring and
cross-package checking. The package build is the proof that the external boundary does not depend on
those aliases.

This contract is separate from SpecFlow product packaging. Product packaging may bundle workspace
packages into one installable artifact; it does not define the future publication model for the UI
library.
