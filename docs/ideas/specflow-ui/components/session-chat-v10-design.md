---
id: ideas.specflow-ui.components.session-chat-v10-design
type: product
title: Session Chat V10 — open directions
status: draft
scope: specflow
areas: [ui, ai, runtime]
tags: [session, conversation, composer, workflow-events, quote, responsive]
read_when:
  - adding workflow-event annotations or exact-event inspection to the Session conversation
  - designing Quote for Session messages
  - revisiting mobile Composer iconography and density
summary: >
  What remains open from the owner-accepted Session Chat V10 direction (2026-10-30): workflow-event
  annotations with exact-event inspection and origin-aware Back, Quote, and mobile Composer
  iconography. The implemented rules live in the Full Session product contract.
related:
  - product.specflow.ui.full-session
  - ideas.specflow-ui.full-session-screen-structure
  - ideas.specflow-ui.components.session-composer-design
  - ideas.specflow-ui.navigation-route-model
  - ideas.specflow-runtime.session-v10-backend-readiness
  - reference.api.sessions
---

# Session Chat V10 — open directions

The owner accepted the V10 conversation, Composer and Work direction on 2026-10-30
([desktop](../examples/session-chat-v10/desktop.html), [mobile](../examples/session-chat-v10/mobile.html)).
The approval covers interaction and information hierarchy, not mock HTML, fixtures, icons or
provider capabilities. Everything V10 decided that is built (chat rules, Work block, Commentary-
grouped Work history, Composer work modes) is now the
[Full Session contract](../../../product/specflow/ui/full-session.md). This note keeps only what is
not built.

## 1. Workflow-event annotations and exact-event inspection

- Annotate a Turn only when reliable **product-owned** workflow events exist (a Task attempt
  starting, a step finishing, a review completing). Never infer Task lifecycle from an agent saying
  "done". Multi-Task reviews stay batches. Avoid duplicate icons and competing status bars.
- Clicking an annotation opens **the specific event or attempt**, not the generic Tasks list; from
  there the user may open the related Task.
- Origin-aware Back on narrow layouts: event → Back → Conversation; event → related Task → Back →
  event → Back → Conversation. From a Tasks root tab, Back walks that tab's stack.
- Blocked on the Runtime/Engine exposing exact authorized Task, attempt and event identities
  ([V10 backend readiness](../../specflow-runtime/session-v10-backend-readiness.md)).

## 2. Quote

Copy and Quote both belong to their authored message. Copy is built; Quote is deferred because the
product decisions are missing: whether Quote replaces or appends to an existing draft, the quoted
format, and focus afterwards.

## 3. Mobile Composer iconography and density

The owner did **not** approve the mock's mobile Composer glyphs (diamond/square symbols for mode
and approval) or controls wrapping and overlapping the toolbar. The shipped work-mode and model
pickers are text triggers on every layout. Still to verify before visual sign-off: 390 px and the
smallest supported width, increased text size, the soft keyboard, and the attachment entry's
meaning, all with DS `MessageComposer`, `IconButton`, `Menu` and `Tooltip`, accessible names and
adequate target sizes.
