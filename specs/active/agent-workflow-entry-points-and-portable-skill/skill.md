# Behaviour: portable skill

The `nevo-specflow` skill for an agent started outside Runtime (D2, D3, D6). It teaches how to use
SpecFlow. The Engine's step context says what to do now.

## Scenarios

**S1. External agent does the current step.** The user starts Claude Code or Codex in a checkout and
asks it to work on the current step of a Specification or Task. In order, the skill tells the agent to:

1. **Find.** Run `project inspect` for the Project Home and current workspace, then `specs list`
   (and `tasks list` for a Task) to name the subject. When more than one fits, ask the user. When the
   workspace the CLI names is not the agent's working folder, tell the user to start the agent there.
   The provider's sandbox does not follow a `cd`.
2. **Inspect.** Run `workflow actions <specId> [--task <id>]`. Act only on what it lists. When an agent
   Turn holds the project or the step is worked on by someone else, say so and stop.
3. **Start, only on request.** When the step is not started and the user asked for it, say "this is
   recorded as you" and run `workflow start`. Never start in order to read.
4. **Read the context.** Run `workflow context`: purpose, instructions, archetype, handoff, the results
   and which of them are owner decisions, the documents with revisions, the types, and the Task context
   references. Read each referenced file. Read a document before saving it.
5. **Work as the bound archetype.** Follow the context's archetype profile and instructions for the
   whole step. Never switch to another archetype because the content mentions other work.
6. **Write.** Use `specs documents add|save|classify` with the revision you read, and register every
   new file with a type. Use `tasks create|edit` only when the step produces Tasks. Never edit
   `specification.yaml`, `task.yaml` or anything under `.execution` by hand.
7. **Finish, only on request.** When the user asks, run `workflow finish` with a declared result, the
   feedback when required, and the changed paths. For an owner-decision result, name it and ask the
   user to confirm that exact result first.
8. **Stop.** Report what changed and the new position. Never start the next step.

**S2. Asked to prepare a whole Specification.** The agent says it does one step at a time, offers to do
the current one, and never reports a finished step as a prepared Specification.

**S3. Refused.** The agent prints the Engine's `CODE: message` and what it means. `SPEC_BUSY` while an
agent Turn holds the project: wait, or ask the user. A stale revision: read again, then save. A gate or
an unmet dependency at finish: name it and leave the attempt active. Never retry with other flags to get
around a refusal.

## Rules

- **Trust statement, shown verbatim by the skill and the README.** "Commands you run through this skill
  are recorded as the local user who owns this checkout. They are not an agent identity and not proof
  that the owner approved anything. The rule that you stop before an owner decision is an instruction;
  the CLI cannot enforce it."
- One step per request, and only the subject the user named.
- The skill names CLI commands only, never Runtime HTTP routes, and never asks for or stores a
  credential.
- The skill text is product-owned. Project specifics come from the Engine's context, never from
  edits to the wrapper.

## Commands

- `nevo-specflow skill show [--provider claude|agents] [--json]` prints the provider-neutral skill, or
  one provider's wrapper. It needs no project, so it also works before `init`.
- `nevo-specflow skill install [--force] [--dry-run] [--project-root <path>] [--json]` writes
  `.claude/skills/nevo-specflow/SKILL.md` and `.agents/skills/nevo-specflow/SKILL.md` in the Project
  Home. For each wrapper it reports `written`, `updated` (an older generated version), `unchanged`, or
  `kept` (edited by hand, or not generated, and kept unless `--force`). It never touches another
  folder. With Git enabled it commits the written files in one Engine commit, and a protected branch
  refuses before writing, as `definitions install` does. With Git disabled it is a plain write.
- `init` runs the install after the definitions and commits both together. `init --no-skill` skips it.
  Updating later is `skill install`.

## Edge cases

- A wrapper folder exists with other files in it: only `SKILL.md` is written.
- The wrapper is a link or a special file: the whole install refuses before writing.
- The CLI is older than the wrapper's version: `install` reports `kept` with the newer version and
  never downgrades it without `--force`.
- Git disabled (no Git repository): `install` writes, and like definitions it notes that it did not
  commit.
- A detached HEAD, or a repository with no commits: `install` is refused with `COMMIT_BLOCKED` before
  writing, as `definitions install` is (D9).
