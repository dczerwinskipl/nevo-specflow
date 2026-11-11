# `tools/`

Repository-internal tooling. **Never** published and never a Nevo SpecFlow product API.

| Directory             | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `tools/docs`          | Launcher for the product docs command, ADR authoring and rules.   |
| `tools/agents`        | Canonical agent-profile validation and provider projections.      |
| `tools/release`       | Version lines, promotions, tags and GitHub Release orchestration. |
| `tools/github`        | Repository governance reconciliation and verification.            |
| `tools/figma-project` | Repository-local design integration tooling.                      |
| `tools/figma-export`  | Browser capture and canonical Figma IR export.                    |
| `tools/figma-import`  | Canonical IR to Figma importer and reconciliation plugin.         |
| `tools/storybook`     | The shared Storybook host and its test configuration.             |
| `tools/eslint`        | Shared ESLint rules: boundaries, import cycles, hardcoded copy.   |
| `tools/git`           | Git hook helpers, such as formatting staged files.                |
| `tools/dev`           | Developer scripts, such as running test suites in Linux.          |

Product-specific build/packaging logic does not live here; it belongs to
`packages/specflow/packaging/` because it exists solely to produce `@nevo/specflow`.

Everything under `tools/*` participates in the pnpm/Turbo workspace only when it has independent
repository-development value.
