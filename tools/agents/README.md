# `nevo-repo-agents` (`nevo-agents`)

Repository-internal builder for canonical Nevo agent profiles. Definitions and instruction sources live under `.nevo/agents/`; provider-specific `SKILL.md` files are generated projections and must not become a second source of truth.

## Canonical model

Each `.nevo/agents/definitions/*.yaml` file contains profile metadata, supported selection modes, required repository knowledge, and structured instruction references. Instruction bodies live in `.nevo/agents/instructions/*.md` fragments.

```yaml
version: 1
id: nevo-agents:implementer
name: Implementer
description: Implements scoped changes.
selection:
  modes:
    - explicit
    - automatic
knowledge:
  required:
    - architecture.principles.normative-language
instructions:
  - id: workflow
    title: Workflow
    source: ../instructions/workflow.md
    required: true
    applies: always
    delivery: inline
  - id: git
    title: Git workflow
    description: Rules for Git work.
    source: ../instructions/git.md
    required: true
    applies:
      when: performing Git operations
    delivery: auto
```

`selection.modes` defines what the profile permits, not which mode every invocation must use. Selection policy belongs to the caller/execution context. A deterministic workflow can bind a profile explicitly; an interactive invocation can allow automatic profile selection. Automatic selection happens before profile activation and must not become mid-invocation profile switching.

Profiles that omit `automatic` are projected as explicit-only skills. Profiles that allow `automatic` remain eligible for provider discovery where the current invocation policy permits it.

`knowledge.required` contains exact stable documentation IDs that must be loaded before work begins. Build/check validates those IDs against `docs/index.generated.json` and rejects missing, `deprecated`, or `superseded` documents. `pnpm agents:build` and `pnpm agents:check` run `pnpm docs:check` first so the generated documentation catalog cannot be stale.

`required` and `applies` describe instruction semantics; `delivery` describes presentation. They are intentionally independent. `auto` is resolved by the build mode.

Instruction Markdown files are fragments: the renderer owns H1/H2 headings, so source fragments may start at H3 or lower but must not contain H1/H2 headings.

## Build

```bash
pnpm agents:build
pnpm agents:build -- --content=reference
pnpm agents:build -- --providers=claude
pnpm agents:check
pnpm agents:test
```

The public `docs:*` commands build `nevo-repo-docs` before invoking it, so documentation discovery works on a fresh checkout after `pnpm install`. Agent build/check also verifies the docs corpus/index before validating `knowledge.required`.

Default `--content=embed` copies `auto` instruction bodies into the generated skill. `--content=reference` emits links/tables for `auto` instructions instead. Explicit `delivery: inline` or `delivery: reference` is unchanged by that flag.

Canonical IDs use a namespace such as `nevo-agents:implementer`. Provider skill names use the portable kebab-case projection `nevo-agents-implementer` because Agent Skills providers require provider-safe names.

Provider outputs:

- Claude: `.claude/skills/<skill>/SKILL.md`
- Codex: `.agents/skills/<skill>/SKILL.md`
- Antigravity: `.agents/skills/<skill>/SKILL.md`

Codex and Antigravity intentionally share the open Agent Skills workspace location. Generated cleanup only touches `nevo-agents-*` directories containing the Nevo generated marker, and a provider-scoped build does not clean another provider root.
