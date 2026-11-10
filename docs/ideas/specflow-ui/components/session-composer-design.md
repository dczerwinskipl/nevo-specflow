---
id: ideas.specflow-ui.components.session-composer-design
type: product
title: AI Session Composer — open capability design
status: draft
scope: specflow
areas: [ui, ai, runtime]
tags: [sessions, composer, providers, modes, approvals, attachments, mobile, capabilities]
read_when:
  - adding attachments, uploads or repository references to the Session Composer
  - designing a certified intent/approval split across providers
  - changing Composer keyboard, paste, drop or camera behavior
summary: >
  Open Composer capability design left after the implemented work-mode and model/effort rules:
  attachments and upload transport, trusted repository references, a future intent/approval split,
  and the remaining interaction questions.
related:
  - product.specflow.ui.full-session
  - ideas.specflow-ui.components.session-chat-v10-design
  - ideas.specflow-runtime.session-v10-backend-readiness
  - reference.api.sessions
  - architecture.ai.canonical-session-turn-work
---

# AI Session Composer — open capability design

The implemented Composer rules (fixed provider, Runtime-owned work modes, omitted unusable modes,
one Model · effort picker, refused vs unknown-outcome commands, "Saved request can't be read") are in
the [Full Session contract](../../../product/specflow/ui/full-session.md#composer). This note keeps
the open capability design.

## 1. Attachments and model capability contract

`StartTurn` carries a text `message` but no persisted attachment references; today attachments stay
in the Composer and are never sent. A future contract must distinguish at least:

- local image/file bytes uploaded to authorized temporary storage, with a stable upload id,
  MIME/size, expiration, user-visible failure and safe redaction;
- a project/repository file reference with trusted project identity, path, revision or snapshot
  semantics and an access guard — a reference is not an upload of bytes;
- camera/photo/gallery selection on mobile, subject to browser/device access;
- model/adapter support for binary/multimodal inputs, with truthful rejection and retry.

Layout direction (accepted with V10): attachments sit **above** the text area inside the Composer
frame, with name/preview, removal, loading/rejection state and bounded height when numerous. The `+`
menu may offer local file, image, project reference and, on mobile, camera; drag/drop/paste are
desktop enhancements. Sending text must never silently drop a rejected or unsupported attachment.

## 2. Work intent versus operation approval

Today no catalogue reports separate operation-approval policies, so a provider's native permission
variants are simply its work modes. If a future catalogue certifies a distinction, keep these
concerns apart and never model them as one enum:

| Concern            | Product meaning                                                                  | Boundary                                                 |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Work intent        | Answer/read, investigate and propose, or perform effects as permitted            | Provider-native capability **only if certified**         |
| Operation approval | Which tool operations may proceed without asking; which still require permission | Runtime + provider adapter + sandbox/security boundaries |
| Workflow decision  | Task completion, review rejection, approval, Engine recovery                     | Deterministic Engine, never a Composer preset            |

No vendor-neutral "Auto" or "Accept all" maps exactly to every CLI; a safe auto policy is not an
unrestricted bypass. Adapters advertise tested combinations; the UI renders those, not the Cartesian
product. An approval preset never authorizes an Engine gate or human review.

## 3. Open questions

1. Upload lifecycle, previews, size limits and cross-Session draft persistence.
2. Whether mobile camera is a separate item or folded into image selection.
3. Keyboard, paste and drop interactions, focus, live state and Composer disabling during
   interactions.
4. Provider-specific policy risks where named modes cannot be matched to stable guarantees.
5. A provider that allows an effort override but no model override is not supported by the picker
   (it renders nothing); no driver reports that combination today.
6. A selection-aware Send capability for next-Turn overrides
   ([V10 backend readiness](../../specflow-runtime/session-v10-backend-readiness.md)).
