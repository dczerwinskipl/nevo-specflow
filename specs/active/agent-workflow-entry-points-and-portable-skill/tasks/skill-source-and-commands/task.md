# Skill source, wrappers and skill commands

## Goal

The CLI package ships one provider-neutral, versioned `nevo-specflow` skill and offers `skill show`
and `skill install`, which writes the Claude and Codex wrappers through the Engine (D3, D6, C2, C3,
architecture.md S1, S2).

## Scope

- **Source.** `packages/specflow/skill/nevo-specflow.md`, written from skill.md: scenarios S1 to S3,
  the rules, and the trust statement verbatim. It names CLI commands only, never Runtime routes or
  credentials. It tells the agent to read the owner-decision marks of `workflow context` (Task
  `owner-decisions-in-step-context`), to do one step, never to switch the bound archetype, and to stop.
- **Packaging.** `packaging/bundle.ts` copies the source to `dist/skill/` beside `bin.js`, and a
  missing source fails the bundle. `src/skill/source.ts` finds it with the fixed layouts of S1 only.
- **Wrappers.** `src/skill/wrapper.ts` renders a wrapper per provider (front matter `name`,
  `description`, the marker with the CLI version and the body digest, then the body) and classifies
  an existing file by C2's table, with the digest and version rules of S2.
- **Commands.** `src/skill/command.ts`: `skill show [--provider claude|agents] [--json]`, which needs no
  project, and `skill install [--force] [--dry-run] [--project-root <path>] [--json]`. The install
  classifies both wrappers, then hands the files to write, with what it saw as `expected`, to the
  Engine's `installProjectFiles` (Task `engine-project-file-install`). It reports
  `written|updated|unchanged|kept` with the reason. On `PROJECT_FILE_CHANGED` it says to run the
  install again, and it notes when nothing was committed (no Git, detached HEAD). It writes only the
  two `SKILL.md` files.
- **Agent command table.** In `AGENT_COMMANDS`, `skill show` is a `read` with no brief form, and
  `skill install` is `refused`. The table test keeps every command in exactly one placement.
- **Docs.** The CLI reference (`skill show`, `skill install`, the outcomes and refusals), the command
  list in `reference.cli.nevo-specflow-contract`, and the trust statement verbatim in
  `packages/specflow/README.md`.
- **Open check.** Whether Codex's `.agents/skills` loader accepts the same front matter as Claude's.
  If it does not, the per-provider rendering takes the difference. Record the finding in the CLI
  reference.

Out: `init` (Task `init-installs-skill`).

## Verification

- Unit: every row of C2's classification table, a development version that never counts as newer,
  `--force` turning `kept` into a write, `--dry-run` writing nothing, and the digest independent of
  CRLF.
- Integration: install into a temporary project (written, then unchanged, then updated after a version
  bump, kept after a hand edit), another file in the wrapper folder left untouched, a link refusal, a
  protected branch refusal, and `skill show` outside any project.
- Packaging: the bundle fails without the source, and the packed CLI's `skill show` prints it.
- The command-table placement test.
- Acceptance A4 (behaviour.md), except `init`.

## Planning notes

Work kind: general (CLI tooling and product text). Recommended profile: `nevo-agents:implementer`.
