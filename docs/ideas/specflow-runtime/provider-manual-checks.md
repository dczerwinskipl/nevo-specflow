---
id: ideas.specflow-runtime.provider-manual-checks
type: engineering
title: Short manual provider checks outside automated tests
status: draft
scope: specflow
areas: [ai, runtime, testing]
tags: [providers, sessions, manual, subscriptions]
read_when:
  - manually verifying an installed provider
  - reporting native provider evidence separately from automated tests
summary: >
  Optional short native-provider checks with explicit test prompts, no embedded
  credentials and no dependency from automated tests or CI on a subscription.
related:
  - engineering.shared.testing
  - ideas.specflow-runtime.claude-provider
  - ideas.specflow-runtime.codex-provider
  - ideas.specflow-runtime.antigravity-provider
---

# Short manual provider checks

These are manual product checks, never commands run by a test runner or CI.
Automated verification uses controlled providers and synthetic credentials.
Removing a subscription, exhausting quota or signing out does not break tests.

Use the operator's normal local login; never put tokens, API keys, cookies or
passwords in prompts, source files, fixtures or committed configuration. Do not
create a separate copy of refresh credentials for a manual check.

Only perform the short check needed within the owner's authorization. State in
the prompt that this is a test and request a minimal reply. Do not automatically
retry a quota/authentication error or switch to a different paid provider.

## Minimal reply

In a manually opened Session:

> To krótki test integracji. Odpowiedz wyłącznie: OK. Nie używaj narzędzi.

Record the selected native mode and the canonical completed/failed result. A
text-only response does not prove writable tools or semantic resume.

## Continuation, when needed

First message:

> To krótki test integracji. Zapamiętaj znacznik TEST-123 i odpowiedz tylko OK. Bez narzędzi.

After reopening that same Session, send:

> To krótki test wznowienia. Podaj wyłącznie poprzedni znacznik. Bez narzędzi.

Choose a fresh public test marker for each check. Verify the second Turn's answer,
not an older transcript entry. Do not repeat the pair automatically.

## Workspace write, only when that is the behavior being checked

Use a disposable workspace and its native Agent mode:

> To krótki test zapisu. Utwórz tylko plik test-agent.txt z tekstem OK. Odpowiedz tylko OK.

Verify the actual file and the canonical outcome. A claimed write in model prose
is not evidence of a file change. Remove only the disposable test artifact.

## Reporting

Record provider/build, selected mode, which manual check ran, its result, and any
quota/authentication limitation. Keep this evidence distinct from controlled
process tests and final-commit CI results. Missing native evidence is a reported
limitation, not a reason to make automated tests depend on a personal account.
