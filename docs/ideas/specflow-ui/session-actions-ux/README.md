---
id: ideas.specflow-ui.session-actions-ux
type: product
title: Session telemetry refresh, unknown-Turn reconcile and Session actions — decision record
status: draft
scope: specflow
areas: [ui, ai, runtime]
tags: [sessions, telemetry, reconcile, recovery, rename, archive, delete, session-actions]
read_when:
  - asking why the provider-limits refresh, the unknown-Turn notice or the Session actions look the way they do
  - reconsidering an alternative rejected for these decisions
summary: >
  Decision record (a proposal, not a current rule) of the provider-limits refresh, the unknown-Turn reconcile
  notice and the Session actions (rename, archive/restore, delete), accepted by the owner on
  2026-11-08 and implemented. Keeps the rationale and the rejected alternatives that still hold;
  the behaviour is owned by the Full Session product contract.
related:
  - product.specflow.ui.full-session
  - ideas.specflow-ui.session-association-ux
  - reference.api.session-telemetry
  - reference.api.sessions
---

# Session refresh, reconcile and Session actions — decision record

**A proposal, not a current rule.** The behaviour is owned by the
[Full Session contract](../../../product/specflow/ui/full-session.md): Context (Session details:
provider-limits refresh), Unknown Turn outcome, Session actions and Work block (no live line for
`unknown`). This file keeps only why; on any difference Full Session wins.

## Decisions

The owner accepted every recommended option on 2026-11-08, with one choice: **Rename stays allowed
on an archived Session** (it is metadata, not conversation); the Runtime does not refuse it with
`SESSION_ARCHIVED`.

- The deleted-elsewhere / unknown-id view is rendered **inside the application shell**, not in a
  standalone shell as first proposed: a standalone shell inside the app shell adds a second `main`
  landmark and fails axe.
- No optimistic rename: the header changes only after the command succeeds.
- The post-delete destination was later decided by the Session association UX (U3): the
  Specification's Sessions list, else `/`
  ([decision record](../session-association-ux/README.md#rationale-and-rejected-alternatives)).

## Ground rules applied

- Primary owns what the user must act on now; Context does not duplicate Primary controls; one owner
  per fact.
- Unavailable choices are omitted, not shown disabled; a read-only reason is one quiet line on open,
  not a hover tooltip.
- Pending commands use the `…ing` label with `aria-disabled` and a guarded handler (nevo-ui `Button`
  has no `busy` prop); no optimistic success. A lost answer is retried with the same `requestId`;
  live state comes from SSE, never from local patching.

## Rejected alternatives

- **Limits refresh as a text link under the last limit row:** moves with the number of windows and
  is easy to miss below a long section.
- **Showing a failed telemetry migration** as "historical usage is incomplete": an operational
  diagnostic with no user action; its effect already shows as absent or partial readings.
- **Reconcile action in Context "Attention / next actions":** hidden behind Context on Narrow, and
  recovery belongs in Primary.
- **Archive/Delete menu items disabled with no reason while a Turn runs:** hover-only, discovered
  late. The dialog opens and explains instead, which prevents the request rather than recovering
  from a 409.
- **Archived state as a header `status` badge:** `status` holds transient progress; archived is a
  lasting state like readiness (subtitle), and a badge would duplicate the archived bar.
- **Archived Composer kept but disabled with a note above it:** a disabled input invites typing and
  duplicates the reason.
- **Type-to-confirm on Delete:** inconsistent with Documents delete.

## Open follow-ups

- A design-system glyph `archive-restore`; `undo` is used until one exists.
