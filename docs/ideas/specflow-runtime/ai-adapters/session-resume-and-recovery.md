---
id: ideas.specflow-runtime.ai-adapters.session-resume-recovery
type: engineering
title: Provider session resume and recovery
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - workflow
  - testing
tags:
  - sessions
  - resume
  - recovery
  - retry
  - providers
read_when:
  - resuming a provider-native conversation
  - retrying after unknown or stale provider session errors
  - deciding whether a failed provider attempt may be safely replayed
  - rotating provider sessions to control stale or irrelevant context
summary: >
  Resume provider sessions only when compatibility is evidenced, recover stale native sessions
  without duplicating unknown work, and authorize automatic provider replay from positive recovery
  evidence rather than from an error string alone.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.invocation-ownership
  - ideas.specflow-runtime.ai-adapters.correlation-identity
  - ideas.specflow-runtime.ai-adapters.error-classification
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
  - architecture.workflow.deterministic-workflow
---

# Provider session resume and recovery

## Separate provider recovery from workflow retry

A workflow attempt and a provider-native session are different concepts.

Workflow retry answers:

> Should deterministic task/workflow work run again?

Provider resume/recovery answers:

> Can this canonical Session safely continue using this provider-native conversation, and can a
> failed provider invocation be replayed without duplicating unknown effects?

An adapter must not silently create a new workflow attempt.

## Legacy evidence

Legacy Nevo already has useful provider-specific recovery:

- Claude retries a failed `--resume` using `--session-id` when the CLI deterministically reports that
  the conversation no longer exists;
- Codex has explicit thread start/resume;
- canonical Session identity remains separate from provider-native identity.

What is not yet explicit is a **neutral resume compatibility and replay-safety policy**.

## Resume compatibility

A stored `ProviderSessionRef` being syntactically valid is not enough to prove it should be resumed.

Candidate compatibility evidence can include:

```text
canonical Session identity
provider
provider-native session identity
workspace/worktree identity
provider execution mode/transport generation
provider session-state schema/version
model compatibility when the provider requires it
```

Not every provider needs every field.

### Workspace identity

A provider session created in one repository/worktree should not be resumed in a different workspace
merely because the native session ID exists.

Use stable workspace identity owned by SpecFlow rather than display path text alone.

A moved path representing the same canonical worktree may remain compatible if current architecture
can prove it.

## Avoid context bleed

Do not automatically carry a provider conversation into unrelated canonical work merely to save
startup cost.

Canonical SpecFlow Session identity owns continuity.

If product behavior later lets one Session intentionally span multiple tasks/specs, that is an
explicit relationship rather than something inferred from the provider's ability to resume.

## Stale/unknown native session recovery

Providers may deterministically report conditions such as:

```text
session not found
unknown conversation
invalid previous message/session
session corrupted or incompatible
```

For an evidenced stale-session class, a candidate recovery is:

1. invalidate the stale provider-native binding;
2. create a fresh provider-native session;
3. continue the same canonical Session/Turn only when replay safety is proven;
4. persist the new `ProviderSessionRef`;
5. record why native continuity was reset.

Do not retry fresh on arbitrary provider failure.

## Positive-evidence-only replay

Automatic replay can duplicate tools/actions if the first invocation actually started work.

A useful rule is:

> Absence of evidence that provider work happened does not prove that no provider work happened.

Automatic replay should require positive evidence.

### Bootstrap never crossed provider dispatch

Conceptually:

```text
providerWorkStarted = false
```

Examples:

- executable/config/readiness failed before dispatch;
- startup was cancelled before provider work began.

### Interrupted invocation was conclusively settled

Conceptually:

```text
providerStopped = true
sessionPreserved = true
actionOutcomes = settled
```

The exact fields are illustrative. The invariant is:

- provider is proven stopped;
- continuation state is known;
- externally visible provider/tool actions have known disposition.

If that evidence is unavailable, preserve fail-closed/unknown semantics rather than replaying
optimistically.

## Resume failure categories matter

Separate at least conceptually:

- **missing/stale session** — fresh native session may help;
- **poisoned/incompatible session history** — fresh session may help, with cause retained;
- **auth failure** — fresh session does not help;
- **quota/rate limit** — fresh session does not help;
- **transport loss with unknown work** — automatic replay may be unsafe;
- **invalid model/request** — fresh session does not make invalid input valid.

Recovery policy should consume structured failure categories, not arbitrary stdout.

## Context management and rotation

Providers differ in native context management.

A future capability can distinguish conceptually:

```text
supportsResume
nativeContextManagement = confirmed | likely | unknown | none
```

If a provider clearly owns context compaction, SpecFlow should not rotate sessions using arbitrary
host thresholds merely to "help".

If the provider does not manage context, a future configurable rotation policy may use:

- number of Turns/runs;
- accumulated input tokens;
- session age;
- explicit context-too-large/provider signal.

Do not copy fixed external thresholds as MVP defaults.

## Native reset does not imply a new product Session

Resetting provider-native continuity does not necessarily require a new canonical product Session.

Canonical prior Turns can remain visible while Runtime records:

```text
native continuity reset
reason = stale provider session
new ProviderSessionRef established
```

The next provider invocation may need canonical context/handoff material because native hidden
history is gone. That belongs to context compilation, not raw-provider-history exposure.

## Verification cases

1. compatible canonical Session/workspace resumes provider-native session;
2. another worktree does not accidentally reuse it;
3. deterministic "session not found" can reset native continuity;
4. auth/quota failure cannot trigger fresh-session retry;
5. failure before provider dispatch may retry with explicit positive evidence;
6. disconnect after possible tool execution remains unknown rather than auto-replayed;
7. late result from invalidated invocation cannot bind the new provider session;
8. canonical history remains reload-equivalent after native reset;
9. provider-managed context is not rotated by arbitrary host thresholds;
10. provider retry never creates or advances a workflow attempt by itself.

## Migration note

Legacy provider-specific fresh-session fallbacks are useful evidence. Move replay-safety decisions
toward the neutral Runtime so each adapter cannot independently decide when duplication is safe.
