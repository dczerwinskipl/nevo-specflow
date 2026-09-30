---
id: ideas.specflow-runtime.ai-adapters.raw-diagnostics-retention
type: engineering
title: Raw provider diagnostics retention
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - testing
tags:
  - diagnostics
  - storage
  - retention
  - privacy
read_when:
  - implementing raw provider capture
  - deciding how long provider stdout/protocol payloads should remain on disk
  - turning a production protocol bug into a replay fixture
summary: >
  Treat raw provider capture as disposable diagnostic trace rather than durable session history:
  release in-memory state at settlement, bound disk retention/size, keep failures longer when useful,
  and promote only minimized regression cases into durable test fixtures.
related:
  - ideas.specflow-runtime.ai-adapters
  - architecture.ai.provider-boundary
  - architecture.ai.canonical-session-turn-work
---

# Raw provider diagnostics retention

## Principle

**Canonical data is durable. Raw provider data is disposable. Curated test fixtures are durable.**

Raw capture is valuable for diagnosing provider protocol drift and parser bugs, but it should not
become a second permanent transcript database.

Normal session reconstruction MUST rely on canonical persisted state, not raw provider files.

## In-memory lifetime

The legacy recorder keeps per-session maps/sets for:

- write queues;
- resolved session directory names;
- "capture path already logged" markers.

Flush waits for writes but does not remove those per-session entries. A long-lived Runtime can
therefore accumulate bookkeeping for every session it has ever captured.

Proposed fix:

- after terminal settlement and final bounded flush, call an explicit
  `releaseSession(sessionId)`/equivalent;
- remove completed write queue, directory mapping, and one-time log marker when no write can still
  reference them;
- make release idempotent;
- keep global diagnostics lifetime separate from provider-session lifetime.

This is an in-memory lifecycle issue even when disk retention is disabled/short.

## Disk lifecycle

Suggested states:

```text
active
  -> retained-normal
  -> expired/deleted

active
  -> retained-diagnostic
  -> fixture-promoted or expired/deleted
```

The names are illustrative; no new canonical product states are implied.

## Candidate retention policy

Values should remain configurable and validated against real usage. A reasonable starting point to
evaluate:

- successful/ordinary captures: 24 hours to 7 days;
- failed/protocol-warning/unknown-shape captures: up to about 30 days;
- explicit manual "retain" may extend a selected diagnostic case;
- global disk cap still applies even to retained diagnostics.

The important requirement is **bounded retention**, not these exact numbers.

## Size control

Use multiple bounds:

- per-turn/per-session capture limit;
- total raw-diagnostics directory limit;
- age/TTL;
- optional LRU deletion inside the eligible set.

Compression (gzip/zstd or equivalent) can reduce cost substantially for repetitive JSONL, but
compression is not a substitute for retention.

## Security/privacy

Raw provider streams may include:

- prompts;
- file contents;
- tool input/output;
- tokens or URLs accidentally written by provider tooling;
- local paths;
- environment-sensitive diagnostics.

Therefore:

- raw capture should be opt-in/configurable where appropriate;
- do not expose it in ordinary product/UI contracts;
- redact known credentials from logs/diagnostics where feasible;
- filesystem permissions should follow local sensitive-runtime-data expectations;
- deletion/retention behavior should be documented.

## Session directory compatibility

Provider session IDs are opaque and unsafe as raw path names unless encoded.

Preserve safeguards against:

- path separators/traversal;
- `.` / `..`;
- Windows reserved device names such as `CON`, `NUL`, `COM1`, `LPT1`;
- excessive segment length;
- case-insensitive collisions on Windows/macOS-like filesystems.

Using a readable sanitized prefix plus a stable cryptographic hash suffix is a reasonable fallback.

## Failure-safe cleanup

Deletion must account for platform filesystem behavior:

- close/finish writers before deletion;
- do not assume a file that is open on Windows can be renamed/deleted like on POSIX;
- failed cleanup should become a diagnostic and be retried by later GC rather than corrupting
  canonical turn outcome.

## Promotion to replay fixture

When a raw capture exposes a parser/protocol bug:

1. isolate the smallest event sequence reproducing the bug;
2. remove secrets and irrelevant payload;
3. normalize unstable IDs/timestamps when they are not part of the behavior;
4. store the minimized fixture with the adapter/parser tests;
5. describe expected canonical output;
6. allow the original raw capture to expire normally.

Do not commit whole real user sessions as regression fixtures.

## Verification cases

- session release removes all in-memory bookkeeping after writes settle;
- release racing the final queued write does not drop/corrupt data;
- TTL removes eligible files only;
- global cap evicts oldest eligible capture deterministically;
- retained diagnostic survives normal TTL until its diagnostic TTL;
- path encoding handles traversal, reserved Windows names, very long IDs, and case collisions;
- raw file is never required for canonical reload equivalence;
- minimized replay fixture reproduces the parser bug after original raw capture is deleted.
