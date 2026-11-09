---
id: product.specflow.cli.interaction-model
type: product
title: CLI interaction model
status: draft
read_when:
  - adding or changing a nevo-specflow command
  - designing command output or exit codes
  - deciding how the CLI confirms a risky action
summary: >
  Root-level product lifecycle commands plus <noun> <verb> resource commands, the
  stdout/stderr/exit-code contract shared with agents and CI, deterministic output,
  and how confirmations gate irreversible actions on the human path only.
related:
  - product.specflow.cli.personas
  - engineering.cli.architecture
  - product.shared.localization
---

# CLI interaction model

`status: draft`. Product-level rules; implementation rules are in the
[CLI architecture](../../../engineering/cli/architecture.md).

## Command shape

```text
nevo-specflow <noun> <verb> [target] [--flags]

nevo-specflow init
nevo-specflow start
nevo-specflow project inspect
nevo-specflow specs list
nevo-specflow specs create
nevo-specflow specs documents status <operation-id>
nevo-specflow definitions validate
nevo-specflow commit status
```

These are existing commands (`packages/specflow/src/program.ts`). Product lifecycle commands
(`init`, `start`, and later `stop` / `status`) live at the executable root.
Resource-oriented commands use short, guessable `<noun> <verb>` forms where a resource has more
than one operation. The full command set is defined with the implementation; this is only the
shape it must follow. Whether
repository documentation discovery (today's `nevo-docs`) becomes part of the product CLI
is a separate decision, not implied here.

## Output contract

| Stream / code  | Carries                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **stdout**     | The result only. A clean human summary by default; stable JSON with `--json`.                          |
| **stderr**     | Progress, warnings, diagnostics, error detail.                                                         |
| **exit 0**     | Success.                                                                                               |
| **exit non-0** | Failure — including "nothing to do" only when the caller asked for an action that cannot be performed. |

Machine-readable stdout stays free of decorative chatter. JSON field names are a
stable contract and are not localized; human text is localizable.

## Determinism

Same inputs and repository state ⇒ same output, including ordering. No dependence on
locale, wall-clock time (beyond explicitly-requested timestamps), or ambient env.

## Confirmations and safety

- Irreversible or outward-facing actions (finalize/merge, cut a release line, delete)
  require an explicit confirmation on the **interactive human path**.
- Agents and CI reach the same operations through explicit flags — never through a
  suppressed prompt. A command that would otherwise need interactive input, run
  non-interactively without the flag, **fails with a clear message**.
- Engine commits never land on a branch the project protects (`git.commits.protectedBranches` /
  `allowedBranches`): such a commit is refused with `BRANCH_PROTECTED`, which covers both cases, and
  `init` offers to switch to a separate branch for the definitions commit. The CLI does not open pull requests; the person merges such a branch.
  Close archive and integration are not covered by the guard yet
  ([ADR 0013](../../../architecture/decisions/0013-engine-owned-commits-and-protected-branches.md)).

## Next-action guidance

Status-style commands answer with **one** computed next action from a fixed table, not
a prose paragraph the reader has to interpret.
