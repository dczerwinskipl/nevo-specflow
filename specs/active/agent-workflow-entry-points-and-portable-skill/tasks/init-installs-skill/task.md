# init writes the skill wrappers

## Goal

The CLI's `init` writes both skill wrappers with the default definitions and commits both in one
`project-init` commit. `init --no-skill` skips the wrappers (C3, architecture.md S4).

## Scope

- `src/init/`: write the wrappers rendered by `src/skill/wrapper.ts` through the Engine's
  `writeProjectFiles`, after the definitions and before the configuration marker. On failure, remove
  the wrappers this run created and keep any that existed, as for the definitions folder.
- After the marker, commit through the Engine's initialization commit (Task
  `engine-project-file-install`) in place of `commitInstalledDefinitions`: one `project-init` commit.
  When that commit fails, the message names both recovery commands (the definitions install with
  `--add-missing`, and the skill install).
- `--no-skill`. The result (human and JSON) lists the wrapper paths beside the definitions.
- `init` still refuses an initialized project, so an update goes through the skill install (D6
  correction).
- Docs: the `init` entry of the CLI reference.

## Verification

Integration over a temporary repository:

- `init` makes one `project-init` commit with the definitions and both wrappers;
- `init --no-skill` writes and commits no wrapper;
- a failure after the wrappers were written removes them, and a wrapper that existed before survives;
- a failing commit prints both recovery commands;
- the JSON result lists the wrapper paths.

Acceptance A4: `init` writes both versioned wrappers from the shipped source.

## Planning notes

Work kind: general (CLI). Recommended profile: `nevo-agents:implementer`.
