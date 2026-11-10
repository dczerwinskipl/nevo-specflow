Use repository documentation as the source of project-specific rules. At the beginning of work, and again when the work enters a new technical or operational area, identify the relevant technologies and activities and query them together:

```bash
pnpm docs:find react git testing
```

`docs:find` is deterministic lexical OR search. Scan the returned match metadata (`title`, `summary`, `read_when`, taxonomy, and matched terms) to identify applicable documents, then read those documents. When results are too broad, refine the activity terms or use a deliberate `--limit`; do not treat every lexical match as a requirement to read unrelated documents.

Choose the discovery command by what you know:

- a natural-language question, or vocabulary you do not know the repository's terms for: `pnpm docs:search "how are document commits owned by the engine"`;
- known terms or taxonomy filters (`--scope`, `--area`, `--tag`): `pnpm docs:find`;
- either way, pick the applicable documents from the result metadata (`summary`, `read_when`, matching sections and their excerpts) and read them before relying on them: architecture, engineering, product and instruction documents in full (`pnpm docs:get --content <id...>`), `reference` documents by the matching sections (`pnpm docs:get <id> --section <sectionId>...`, with the section ids `docs:search` shows; read the whole reference document when you need more than those sections). `docs:search` ends with a `read all:` line that does exactly this for all its results (drop the ids and sections that do not apply). A search excerpt is not the document.

Every `docs:search` result states its `mode` (`hybrid`, or `lexical` with a `reason`), so you do not need to check whether semantic search is available first.

When an exact stable document ID is supplied by an agent profile, workflow, task, or another authoritative document, resolve it directly with `pnpm docs:get <id...>` instead of searching for it again.

Do not invent repository-specific guidance when the index has no applicable document. Generic engineering knowledge may fill implementation gaps, but it must not be presented as a repository rule.
