---
id: ideas.specflow-ui.examples.session-chat-v10
type: product
title: Session Chat V10 interactive UX examples
status: draft
scope: specflow
areas: [ui, ai]
tags: [session, conversation, composer, work, prototype]
read_when:
  - reviewing Session Chat V10 desktop or mobile interaction examples
summary: >
  Standalone desktop and mobile HTML fixtures for the accepted Session Chat V10 UX direction.
  Synthetic content is illustrative and must not be used as a Runtime contract.
related:
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-ui.full-session-screen-structure
---

# Session Chat V10 — approved UX example, not production

Owner accepted V10 on 2026-10-30 with one explicit exception: mobile Composer iconography.
Interactive examples:

- [Desktop](desktop.html)
- [Mobile](mobile.html)
- [Design and behavior specification](../../components/session-chat-v10-design.md)
- [Workspace V2](../../full-session-screen-structure.md#10-secondary-navigation-model--owner-approved-workspace-v2)

These HTML pages contain synthetic Session/Task/provider data and a generated 144-entry Work
timeline. They are **mockups, not production components, APIs, security guarantees or an
extension of the Design System**.

**Unaccepted:** the mobile Composer diamond/square glyphs for mode and approval, icons
overlapping or wrapping to a second line, exact spacing and typography, illustrative Context
section contents, synthetic provider capabilities and the demo-only controls.
Replace mock icons and ad-hoc code with real Nevo UI Design System components/icons/tokens.
The demo design is a reference for behavior, not code to copy.

**Approved direction:** a normal conversation with user bubbles and centered, width-limited
assistant Markdown, message Copy/Quote, one truthful live-activity summary and optional
compact Work counts, subtle authoritative workflow annotations, direct event inspection,
Commentary-grouped Work timeline with separately identified thinking summaries and progressive
loading, origin-aware mobile Back, composer settings and attachments within one frame, and the
existing Workspace V2 layout.

Review the design specification before implementing. Missing Runtime/adapter capabilities
must be handled as separate implementation work; the mock is not evidence of readiness.
