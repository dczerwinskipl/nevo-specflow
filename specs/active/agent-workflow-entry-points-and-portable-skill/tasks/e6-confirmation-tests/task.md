# Confirm delivered E6 behaviour with tests

## Goal

Tests show that the E6 behaviour this Specification relies on holds: A5, A9, A10 and A11
(behaviour.md). This adds tests only. It changes no E6 rule.

## Scope

For each scenario, find the existing test that proves it. Add one where none does, named after its
acceptance id:

- **A5.** A managed Claude and a managed Codex attempt Turn run from the brief without native skills
  or MCP (Claude setting sources off). A provider that cannot take the invocation-bound tools makes
  Run with agent refuse instead of downgrading to a chat.
- **A9.** A Task implementation attempt 2 gets its Task context and the failed Review's feedback as
  its handoff, finishes, and does not launch Review.
- **A10.** Drafts, dependencies and documents made in an attempt are visible at once. A Breakdown
  finish never touches owner-created drafts (`materializeTasks`).
- **A11.** A `reviewer` attempt keeps the reviewer archetype and profile in its brief and context for
  the whole attempt, also when the content talks about implementation.

A test that shows a defect is reported in the finish feedback with its evidence. The fix is not part
of this Task.

## Verification

The tests pass, and each of A5, A9, A10 and A11 is mapped to at least one named test in the finish
feedback.

## Planning notes

Work kind: backend (tests). Recommended profile: `nevo-agents:implementer`. It depends on no other
Task and can run first.
