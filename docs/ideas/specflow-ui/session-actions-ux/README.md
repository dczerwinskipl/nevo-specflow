---
id: ideas.specflow-ui.session-actions-ux
type: product
title: Session telemetry refresh, unknown-Turn reconcile and Session actions — decision record
status: current
scope: specflow
areas: [ui, ai, runtime]
tags: [sessions, telemetry, reconcile, recovery, rename, archive, delete, session-actions]
read_when:
  - asking why the provider-limits refresh, the unknown-Turn notice or the Session actions look the way they do
  - reconsidering an alternative rejected for plan decisions D1, D2 or D10
summary: >
  Rationale and decision record for plan decisions D1, D2 and D10 of the Managed Session UI
  integration, accepted by the owner on 2026-11-08 and implemented. The behaviour itself lives in
  full-session-screen-structure.md §7.7, §17.1 and §22.1 and Chat V10 §3.1/§6.
related:
  - ideas.specflow-ui.full-session-screen-structure
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.components.session-composer-design
  - product.specflow.ui.documents-archetypes
  - reference.api.session-telemetry
  - reference.api.sessions
---

# Session refresh, reconcile and Session actions — decision record

The accepted behaviour is owned by
[Full Session screen structure](../full-session-screen-structure.md) — §7.7 provider-limits refresh,
§17.1 Turn whose outcome is unknown, §22.1 Session actions and archived Session — and
[Chat V10](../components/session-chat-v10-design.md) §3.1 (no live line for `unknown`) and §6
(archived bar in the Composer slot). This file keeps only why.

## Decision

Owner accepted every **Recommended** option on 2026-11-08 (plan D1, D2, D10), with one choice:
**Rename stays allowed on an archived Session** (it is metadata, not conversation); the Runtime does
not refuse it with `SESSION_ARCHIVED`.

**Implementation deviation:** the deleted-elsewhere / unknown-id view is the not-found composition
rendered **inside the application shell** through `AppWorkspace`, not `SpecFlowStandaloneShell` as
first proposed. A standalone shell inside the app shell adds a second `main` landmark and fails axe.

**Supersedes plan T11:** no optimistic rename title; the header changes only after the command
succeeds.

## Ground rules applied

- Primary owns what the user must act on now; Context does not duplicate Primary controls
  (structure §7.2); one owner per fact (Chat V10 §3.1).
- Unavailable choices are omitted, not shown disabled (by analogy with Composer decision 4); a
  read-only reason is one quiet line on open, not a hover tooltip (Documents D7).
- Pending commands use the `…ing` label with `aria-disabled` and a guarded handler (nevo-ui `Button`
  has no `busy` prop); no optimistic success (Documents D8). A lost answer is retried with the same
  `requestId`; live state comes from SSE, never from local patching.

## Rejected alternatives

- **Limits refresh as a text link under the last limit row:** moves with the number of windows and
  is easy to miss below a long section.
- **Showing `migration.status === 'failed'`** as "Historyczne zużycie jest niepełne.": an
  operational diagnostic with no user action; its effect already shows as absent/partial readings.
- **Reconcile action in Context "Attention / next actions":** hidden behind Context on Narrow, and
  §17 puts recovery in Primary.
- **Archive/Delete menu items disabled with no reason while a Turn runs:** hover-only, discovered
  late. The dialog opens and explains instead, which prevents the request rather than recovering
  from a 409.
- **Archived state as a header `status` badge:** `status` holds transient progress; archived is a
  lasting state like readiness (subtitle), and a badge would duplicate the archived bar.
- **Archived Composer kept but disabled with a note above it:** a disabled input invites typing and
  duplicates the reason.
- **Post-delete navigation to the owning Specification:** the real route's scope is `unknown`
  (Session–Spec association is out of scope), so `/sessions/new` is the only honest destination.
- **Type-to-confirm on Delete:** inconsistent with Documents delete.

## Follow-ups

- Possible design-system glyph `archive-restore`; `undo` is used until one exists.
