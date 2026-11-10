---
id: ideas.specflow-ui.navigation-route-model
type: product
title: SpecFlow UI navigation — open items
status: draft
scope: specflow
areas:
  - ui
tags:
  - information-architecture
  - routing
  - primary-secondary
  - session
  - responsive
read_when:
  - designing Task evidence drill-down (Diff, Handover, Verification, Artifact, File)
  - designing origin-aware launch of workflow events from a Session conversation
  - designing Floating Session navigation
summary: >
  Open navigation items not yet implemented: Task evidence drill-down in the Task's Secondary
  slot, origin-aware launch of workflow events from the conversation, and Floating Session.
  The implemented hierarchy, reachability, Session start and Back/Close rules live in
  product.specflow.ui.interaction-model.
related:
  - ideas.specflow-ui
  - product.specflow.ui.interaction-model
  - product.specflow.ui.full-session
  - ideas.specflow-ui.screens.floating-session
---

# SpecFlow UI navigation — open items

The implemented navigation (product hierarchy and routes, reachability, starting a Session and the
navigator, state preservation, Back and Close) is specified in
[UI interaction model](../../product/specflow/ui/interaction-model.md). This document keeps only
what is not built yet.

## 1. Task evidence drill-down

Task evidence uses the same Secondary slot as Task Detail and never creates a nested third pane:

```text
Task Detail root
  -> Diff / Changes
  -> Handover
  -> Verification
  -> Artifact
  -> File
      -> Back
Task Detail root
```

On split layouts an evidence target temporarily replaces Task Detail in Secondary while the
Specification or Session stays Primary; on Narrow it is a pushed-detail stack. Back inside the
stack returns to Task Detail first; closing the whole Secondary returns to the owning Primary.
Depends on canonical Handover, verification, artifact and file-reference contracts.

## 2. Origin-aware launch of workflow events

Once the conversation carries reliable product-owned workflow events (a Task attempt starting, a
step finishing, a review completing), clicking one opens **that exact event or attempt**, not the
generic Tasks list. On Narrow the next Back returns directly to the conversation; following the
event's related Task unwinds Task → event → conversation. Opening the same event from a Tasks root
tab returns along that tab's own local stack. The draft, scroll and source origin are preserved.
Depends on workflow-event annotations in the Session read model.

## 3. Floating Session

A Wide-only Floating Session would give quick conversation access from a Specification or Task
without leaving it, with **Open full session** in its own header; it is an alternate presentation of
the same Session, never a required step, and Compact/Narrow keep opening the Session directly. Its
position, size and minimized order would be local state, not URL state; closing it leaves the
underlying Wide context in place. See [Floating Session](screens/floating-session-ui-spec.md).

## 4. Deliberately unresolved

- provider-error/limit handover to another agent (failure classification and context transfer are
  not reliable enough yet);
- create/archive Specification visual treatment beyond the documented creation semantics;
- future File preview / Open-in-IDE.
