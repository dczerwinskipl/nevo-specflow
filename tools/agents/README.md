# `nevo-repo-agents` (`nevo-agents`)

Repository-internal builder for canonical Nevo agent profiles. Definitions and instruction sources live under `.nevo/agents/`; provider-specific `SKILL.md` files are generated projections and must not become a second source of truth.

## Canonical model

Each `.nevo/agents/definitions/*.yaml` file contains profile metadata plus structured instruction references. Instruction bodies live in `.nevo/agents/instructions/*.md` fragments.

```yaml
id: nevo-agents:implementer
name: Implementer
description: Implements scoped changes.
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

`required` and `applies` describe semantics; `delivery` describes presentation. They are intentionally independent. `auto` is resolved by the build mode.

Instruction Markdown files are fragments: the renderer owns H1/H2 headings, so source fragments may start at H3 or lower but must not contain H1/H2 headings.

## Build

```bash
pnpm agents:build
pnpm agents:build -- --content=reference
pnpm agents:build -- --providers=claude
pnpm agents:check
pnpm agents:test
```

Default `--content=embed` copies `auto` instruction bodies into the generated skill. `--content=reference` emits links/tables for `auto` instructions instead. Explicit `delivery: inline` or `delivery: reference` is unchanged by that flag.

Canonical IDs use a namespace such as `nevo-agents:implementer`. Provider skill names use the portable kebab-case projection `nevo-agents-implementer` because Agent Skills providers require provider-safe names.

Provider outputs:

- Claude: `.claude/skills/<skill>/SKILL.md`
- Codex: `.agents/skills/<skill>/SKILL.md`
- Antigravity: `.agents/skills/<skill>/SKILL.md`

Codex and Antigravity intentionally share the open Agent Skills workspace location. Generated cleanup only touches `nevo-agents-*` directories containing the Nevo generated marker, and a provider-scoped build does not clean another provider root.
