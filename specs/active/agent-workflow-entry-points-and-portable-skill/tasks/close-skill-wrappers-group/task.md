# Skill wrappers group in the Close dialog

## Goal

While a skill wrapper is uncommitted, the UI Close dialog names it as a **Skill wrappers** group with
the remedy `nevo-specflow skill install`, so it is never shown as a Specification's files (D10,
architecture.md S3).

## Scope

- `features/tasks/execution/specification/RepositoryBlockers.tsx`: the owner `{ kind: 'skill' }` of the
  uncommitted hold (contracts variant from Task `engine-project-file-install`) gets its own name and
  key, like `definitions`, instead of falling into the Specification branch. Its group shows the
  paths as the others do, and an explanation that `nevo-specflow skill install` in this checkout
  commits them. The UI offers no commit action for it: the HTTP `all` leaves `skill` out, as it does
  `definitions`.
- i18n `en.json` and `pl.json`, beside `ownerDefinitions`: the owner name ("Skill wrappers") and the
  remedy sentence with the command as code.
- The Close dialog story gains a hold with a `skill` owner.

Out: the CLI Close report (Task `skill-source-and-commands`) and the Engine hold (Task
`engine-project-file-install`).

## Verification

- Component test: a hold with a `skill` owner renders the **Skill wrappers** heading, its paths and
  the `skill install` remedy, and no Specification link; a hold with `definitions` and
  `specification` owners renders as before.
- The i18n key check passes for both locales.
- The UX acceptance line of ux.md for the Close dialog.

## Planning notes

Work kind: ui. Recommended profile: `nevo-agents:implementer-ui`.
