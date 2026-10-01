---
id: ideas.specflow-ui.navigation-route-model
type: product
title: SpecFlow UI navigation and route model
status: draft
scope: specflow
areas:
  - ui
  - product
  - navigation
tags:
  - information-architecture
  - routing
  - primary-secondary
  - session
  - responsive
read_when:
  - implementing SpecFlow product routing or Back behavior
  - validating that every product surface is reachable
  - deciding which interaction state belongs in the URL versus local UI state
  - designing cross-screen navigation between Specs, Specification, Task, Session, and Settings
summary: >
  Cross-screen navigation contract for SpecFlow UI. Defines the Workbench entry point,
  routable product surfaces, Primary/Secondary drill-down, direct Full Session access,
  local inspector stacks, responsive representation, and Back behavior without freezing
  exact URL syntax or Session-creation flow.
related:
  - ideas.specflow-ui
  - ideas.specflow-ui.information-navigation-inventory
  - ideas.specflow-ui.spec-task-screen-structure
  - ideas.specflow-ui.full-session-screen-structure
  - product.specflow.ui.interaction-model
  - design-system.principles.system-boundary
---

# SpecFlow UI navigation and route model

## 1. Purpose

This document is the cross-screen reachability contract for the current SpecFlow UI proposal.

Individual screen specs own their information hierarchy and local interactions. This document owns
how those surfaces connect, which context is preserved, and which navigation intent must survive
reload/deep linking.

It intentionally does **not** freeze:

- exact URL syntax;
- Session creation/start flow;
- the responsive presentation used to replace Floating Session where Floating Windows are unsupported;
- exact header/menu affordances beyond the product intent they must expose.

## 2. Product terminology

When a collective name for the whole product UI is useful, use **Nevo SpecFlow Workbench**.

Workbench is the application experience, not another product route or dashboard screen.

Reserve **Workspace** primarily for:

- Nevo UI layout mechanics such as `AppWorkspace`, Primary, Secondary, and local workspace stacks;
- explicitly qualified repository/filesystem terms such as workspace root.

Product surfaces should normally be named by the thing the user is doing or inspecting:

- Specs Overview;
- Specification;
- Task Detail;
- Full Session;
- Project Settings.

Existing document/file names containing `workspace` do not need a mechanical rename. New
user-facing copy and navigation should avoid using Workspace as a competing product-area name.

## 3. Global entry and navigation

The Workbench default product entry is **Specs Overview**.

There is no separate product Home area in the current information architecture.

Persistent product navigation remains deliberately small:

~~~text
Project selector

Specs

Project Settings
~~~

Sessions, Tasks, Work, Files, Changes, workflow definitions, and artifacts may have routable/detail
surfaces without becoming global navigation items.

## 4. Reachability matrix

| Surface | Normal entry | Representation |
| --- | --- | --- |
| Specs Overview | global Specs / default Workbench entry | Primary |
| Specification | neutral Specification target or stable deep link | Primary |
| Task Detail | Task row, concrete Task signal, or contextual Task reference | Secondary on split layouts; pushed detail on narrow |
| Floating Session | quick conversation target where Floating Session is supported | floating presentation outside AppWorkspace stack |
| Full Session | explicit full-session action, Floating Session header, or stable deep link | main Primary + optional Secondary |
| Session Context | Full Session Context action/default split entry | Secondary or pushed detail |
| Session Work | Full Session Work action | Secondary or pushed detail |
| File/evidence/Handover/detail | contextual reference from Task or Session | replaces current Secondary; never creates a third pane |
| Project Settings | global Project Settings / stable section intent | Primary |

The table defines reachability, not exact route strings.

## 5. Specification and Task navigation

A neutral Specification target opens the Specification without inventing a Task selection.

A concrete Task signal may open the Specification with that Task detail already active in one
navigation action.

On a split-capable layout:

~~~text
Specification Primary
+ Task Detail Secondary
~~~

On a narrow layout, Task Detail becomes the visible pushed surface and Back returns to the
Specification with the originating selection/scroll context preserved where practical.

Opening Task Detail is navigation only. It must not perform the workflow action that the Task may
later offer.

## 6. Task evidence drill-down

Task evidence uses the same Secondary slot as Task Detail. It does not create a nested third pane.

~~~text
Task Detail root
  -> Diff / Changes
  -> Handover
  -> Verification
  -> Artifact
  -> File
      -> Back
Task Detail root
~~~

On split layouts, an evidence/detail target temporarily replaces Task Detail in Secondary while the
Specification or Session remains Primary.

On narrow layouts, the same interaction is a pushed-detail stack.

Closing the whole Secondary context returns to the owning Primary. Back inside the local detail stack
returns to Task Detail first.

## 7. Session access

A related/current Session reference should make two different intents discoverable:

~~~text
Conversation target
Open full session
~~~

Where Floating Session is supported, the conversation target may open the compact floating
conversation while preserving the current Specification/Task context.

**Open full session** navigates directly to Full Session. It must not require opening Floating
Session first.

Floating Session also exposes Open full session in its own header.

The presentation used for the quick conversation target when Floating Session is unavailable is
intentionally unresolved here and must not be inferred by implementation.

This section concerns opening an **existing Session**. How a new Session is created/started is a
separate product decision and is not defined by this document.

## 8. Full Session navigation

Full Session is a first-class routable product surface but not a global sidebar destination.

On split-capable entry with no more specific Secondary target:

~~~text
Conversation Primary | Context Secondary
~~~

Context may be closed and should remain closed until explicitly reopened.

Context and Work are Secondary roots. File, Task, Handover, artifact, Work-item, and ToolAction detail
replace the current Secondary and use a local stack:

~~~text
Context -> Task/File/Handover/detail -> Back -> Context
Work    -> Work item -> ToolAction    -> Back -> Work item -> Back -> Work
~~~

No interaction creates a third simultaneous workspace pane.

On narrow layouts, Conversation remains the main Session surface and explicit Context/Work/detail
actions push the same Secondary content.

## 9. Full Session return context

When Full Session is entered from a Specification or Task context, navigation should preserve enough
product state to return to that context without relying on accidental browser-history order.

Examples:

~~~text
Specification + TASK-03
  -> Open full session
  -> return
Specification + TASK-03
~~~

~~~text
Specification + TASK-03
  -> Floating Session
  -> Open full session
  -> return
Specification + TASK-03
~~~

A direct Full Session deep link has no transient originating context to restore. Its deterministic
parent fallback is the owning Specification when available.

## 10. Route state versus local state

Stable product resources and user-significant navigation intent should be reloadable/deep-linkable
where doing so preserves the same product context.

At minimum, navigation must be able to represent:

- Active versus Archive Specs collection;
- selected Specification;
- selected Task when the user intentionally navigated to Task context;
- Full Session;
- Project Settings section;
- a meaningful Full Session inspector/detail target when opened as a stable deep link.

Local UI state should remain local when it is presentation-only, for example:

- Floating Session position/size;
- minimized floating-window ordering;
- transient hover/focus;
- local disclosure state that does not represent a product resource.

Exact URL encoding remains an implementation decision.

## 11. Back and Close semantics

Back follows product hierarchy/local drill-down rather than blindly replaying browser history.

Close removes contextual presentation without pretending the resource no longer exists.

Examples:

- Task evidence Back -> Task Detail;
- Task Detail Back/Close -> originating Specification/Session context;
- Full Session inspector detail Back -> inspector root;
- Floating Session Close -> underlying Specification/Task remains;
- Full Session return -> preserved originating product context when present.

## 12. Deliberately unresolved

This navigation model does not decide:

- how a new Session is created or started;
- what exact quick-conversation presentation replaces Floating Session on unsupported widths;
- final route path syntax;
- final Overview signal grouping/sorting tie-breakers;
- create/archive Specification interaction design.
