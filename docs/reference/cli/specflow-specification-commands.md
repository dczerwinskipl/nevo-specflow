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
nevo-specflow specs create --title "Payments" --archetype minimal --json
nevo-specflow specs create --title "Payments" --archetype feature --with behaviour --with ux
nevo-specflow specs create --title "Payments" --archetype minimal --worktree --base-ref HEAD
nevo-specflow specs create --title "Payments" --archetype minimal --worktree --integration-target-workspace-id <uuid>
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

`specs create` requires `--archetype <id>` (`minimal`, `feature`, `architecture`; there is no default, a missing
option is a usage error naming it). `--with <templateId>` is repeatable (each id once) and selects suggested
documents of the archetype; an unknown archetype or id is `ARCHETYPE_UNKNOWN`. The CLI uses the catalogue of the
installed Engine, so it is current by construction; the output (`--json` or human) lists the created document ids.
Re-running the same `--operation-id` after the catalogue changed may conflict (the archetype version is part of
the operation identity); finish such an operation with `specs recover <operation-id>`. `archetypes list|show|validate`
belongs to the later definitions slice and does not exist yet.

`specs create` additionally accepts `--goal`, `--workspace-id`, `--branch`,
`--operation-id`, `--project-root`, and `--json`. New-worktree-only options require
`--worktree`. The CLI default uses its **verified current checkout** context, whereas an
omitted HTTP Create target means primary; do not conflate these defaults.

Use `--preview` before any destructive Close; mutation requires `--yes`.
Workspace Close takes `workspaceId`, not one of its Specs. Reuse the original
`--operation-id` on retries. These commands work offline; the CLI does **not** call Runtime
HTTP and its local OS-account trust is distinct from authenticated HTTP grants.

Usage errors of nested commands (for example a missing required option of `specs create`) now exit with code **2**
like the top-level ones; they used to end the process with code 1. Operation failures still exit 1.

See `packages/specflow/src/specs/command.ts` for the exact options and operator diagnostics.
