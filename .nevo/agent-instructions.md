# Nevo SpecFlow agent bootstrap

Nevo agent profiles are defined under `.nevo/agents/definitions/`. Provider-specific skills under `.claude/skills/` and `.agents/skills/` are generated projections and are not sources of truth.

When repository rules may affect the work, identify the technologies and activities involved and query the documentation index with all relevant terms together, for example:

```bash
pnpm docs:find react git testing
```

`docs:find` is deterministic lexical OR search: every document matching at least one query term is returned unless an explicit `--limit` is supplied. Inspect the result metadata and load the documents that apply to the current work. Use exact stable IDs when a profile, workflow, or another document gives them explicitly:

```bash
pnpm docs:get engineering.repository.git-workflow engineering.shared.testing
```

Do not infer repository-specific rules when no matching documentation exists. Prefer the authoritative document over duplicated guidance in prompts or generated skills.
