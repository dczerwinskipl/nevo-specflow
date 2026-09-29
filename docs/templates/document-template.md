# Document template

Copy this file to the appropriate place under `docs/`, delete this notice, and add a real
frontmatter block. This template has no frontmatter because `docs/templates/**` is exempt from
corpus validation.

## Frontmatter

```yaml
---
id: <stable-concept-id>
type: engineering # hub | architecture | adr | engineering | product | reference | instruction
title: <Title>
status: current # current | draft | deprecated | superseded
read_when:
  - <a concrete activity that should load this doc>
summary: >
  One or two sentences describing what this document governs.
related:
  - <another-document-id>
---
```

## Body guidance

- Lead with the rule, contract, or system shape rather than migration history.
- Keep one authoritative home for each durable rule.
- Link to related sources of truth instead of copying normative requirements.
- Prefer explicit guarantees and concise structure over long prose.
