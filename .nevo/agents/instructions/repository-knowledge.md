Use repository documentation as the source of project-specific rules. At the beginning of work, and again when the work enters a new technical or operational area, identify the relevant technologies and activities and query them together:

```bash
pnpm docs:find react git testing
```

The search is deterministic lexical OR search. Scan the returned match metadata (`title`, `summary`, `read_when`, taxonomy, and matched terms) to identify applicable documents, then read those documents. When results are too broad, refine the activity terms or use a deliberate `--limit`; do not treat every lexical match as a requirement to read unrelated documents.

When an exact stable document ID is supplied by an agent profile, workflow, task, or another authoritative document, resolve it directly with `pnpm docs:get <id...>` instead of searching for it again.

Do not invent repository-specific guidance when the index has no applicable document. Generic engineering knowledge may fill implementation gaps, but it must not be presented as a repository rule.
