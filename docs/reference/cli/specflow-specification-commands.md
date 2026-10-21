---
id: reference.cli.specflow-specification-commands
type: reference
title: Offline Specification CLI commands
status: current
scope: specflow
areas: [cli, runtime]
read_when:
  - using nevo-specflow specs commands
  - checking CLI parity with Engine and HTTP operations
summary: >
  Implemented Engine-backed offline CLI for creation, discovery, Specification archive and
  workspace integration.
related:
  - reference.cli.nevo-specflow-contract
  - reference.api.specflow-specification-operations
---

# Offline Specification CLI commands

## Available commands

```sh
nevo-specflow specs create --title "Payments" --json
nevo-specflow specs create --title "Payments" --worktree --base-ref HEAD
nevo-specflow specs create --title "Payments" --worktree --integration-target-workspace-id <uuid>
nevo-specflow specs list --json
nevo-specflow specs resolve <spec-id> --json
nevo-specflow specs close <spec-id> --preview
nevo-specflow specs close <spec-id> --archive-only --yes
nevo-specflow specs worktree close <spec-id> --preview
nevo-specflow specs worktree close <spec-id> --yes
nevo-specflow specs workspace close <workspace-id> --preview
nevo-specflow specs workspace close <workspace-id> --yes
nevo-specflow specs workspace inspect <workspace-id> <operation-id>
nevo-specflow specs close-inspect <operation-id>
```

`specs create` additionally accepts `--goal`, `--workspace-id`, `--branch`,
`--operation-id`, `--project-root`, and `--json`. New-worktree-only options require
`--worktree`. The CLI default uses its **verified current checkout** context, whereas an
omitted HTTP Create target means primary; do not conflate these defaults.

Use `--preview` before any destructive Close; mutation requires `--yes`.
Workspace Close takes `workspaceId`, not one of its Specs. Reuse the original
`--operation-id` on retries. These commands work offline; the CLI does **not** call Runtime
HTTP and its local OS-account trust is distinct from authenticated HTTP grants.

See `packages/specflow/src/specs/command.ts` for the exact options and operator diagnostics.
