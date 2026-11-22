---
id: docs.architecture-ai-readme
type: hub
title: AI architecture
status: current
summary: >
  Provider-neutral AI session, turn, work, interaction, lifecycle, capability, and
  adapter-boundary architecture for Nevo SpecFlow.
---

# AI architecture

- [Canonical Session / Turn / Work model](canonical-session-turn-work.md)
- [Provider boundary](provider-boundary.md)
- [Managed Session persistence and lifecycle](session-storage-and-lifecycle.md)
- [Provider process ownership and limits](provider-process-ownership.md)

Product presentation belongs under
[AI session UX](../../product/specflow/ui/ai-session-ux.md).

## Session and provider component boundaries

Managed Sessions are a Runtime capability, not part of the Engine workflow model.
The Engine admits write claims and owns Specification state; the Runtime owns
Session/Turn lifecycles, provider processes and their SQLite persistence.

```mermaid
block-beta
  columns 1
  block:api
    columns 2
    apiTitle["1. Session interfaces"]:2
    apiEvents["Session API and events"]
    apiInteractions["Canonical interactions"]
  end
  block:sessions
    columns 2
    sessionsTitle["2. Runtime Sessions"]:2
    sessionsLifecycle["Session, Turn and Work lifecycle"]
    sessionsProvider["Provider-neutral adapters"]
  end
  block:resources
    columns 2
    resourcesTitle["3. Runtime-owned resources"]:2
    resourcesDb["Session SQLite worker"]
    resourcesCli["Managed provider processes"]
  end
  block:engine
    columns 2
    engineTitle["4. Separate Engine authority"]:2
    engineClaims["Workspace claims"]
    engineSpecs["Specification and workflow mutations"]
  end
```

This is a responsibility map, not a sequence or a promise that every Session writes a
Specification. A read-only Turn needs no workspace write claim. For the actual admission
and settle order see the [Session Turn sequence](session-storage-and-lifecycle.md#turn-flow),
the [provider boundary](provider-boundary.md) and
[Engine execution claims](../runtime/workspace-execution-claims.md).
