# Nevo SpecFlow agent bootstrap

Nevo agent profiles are defined under `.nevo/agents/definitions/`. Provider-specific skills under `.claude/skills/` and `.agents/skills/` are generated projections and are not sources of truth.

Agent profiles are explicitly selected by a user, workflow, or orchestrator. Do not infer or switch the active Nevo profile from task wording alone.

When the selected profile declares `knowledge.required`, load those exact stable document IDs first. Generated provider projections include the corresponding `pnpm docs:get ...` command.

When repository rules may affect the work beyond that required baseline, identify the technologies and activities involved and query the documentation index with all relevant terms together, for example:

```bash
pnpm docs:find react git testing
```

`docs:find` is deterministic lexical OR search: every document matching at least one query term is returned unless an explicit `--limit` is supplied. Inspect the result metadata and load the documents that apply to the current work. Use exact stable IDs when a profile, workflow, or another document gives them explicitly:

```bash
pnpm docs:get engineering.repository.git-workflow engineering.shared.testing
```

`docs:get` fails closed for `deprecated` and `superseded` documents. Replace an inactive ID with its current authoritative successor before continuing.

Do not infer repository-specific rules when no matching documentation exists. Prefer the authoritative document over duplicated guidance in prompts or generated skills.
