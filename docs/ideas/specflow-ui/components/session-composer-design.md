---
id: ideas.specflow-ui.components.session-composer-design
type: product
title: AI Session Composer — capabilities for accepted V10 interaction
status: draft
scope: specflow
areas: [ui, ai, runtime]
tags: [sessions, composer, providers, modes, approvals, attachments, mobile, capabilities]
read_when:
  - designing or implementing Session Composer
  - mapping provider-native execution modes and approvals to UI choices
  - adding attachments and model-specific capabilities
summary: >
  Composer capability resolution for accepted V10 interaction direction. A stable provider per Session,
  optional model/effort/intent/policy overrides per next Turn, attachment-first composer layout,
  and provider-declared certified presets. Mobile iconography and mock styling are not production designs.
related:
  - ideas.specflow-ui.components.session-conversation
  - ideas.specflow-ui.full-session-screen-structure
  - reference.api.sessions
  - architecture.ai.canonical-session-turn-work
---

# AI Session Composer — accepted V10 interaction, open capability design

## 1. Acceptance and scope

**Owner-approved:** Workspace V2 navigation and [Session Chat V10](session-chat-v10-design.md)
conversation/Composer/Work UX direction, with
[desktop](../examples/session-chat-v10/desktop.html) and
[mobile](../examples/session-chat-v10/mobile.html) interactive examples.

**Not owner-approved:** the mobile Composer's ambiguous square/diamond glyphs and controls
wrapping/overlapping underneath the toolbar. Replace all demo icons, CSS and UI structures
with Nevo UI Design System components, recognizable semantics, accessible labels and
responsive keyboard/touch behavior.

The shared interaction direction has attachments above the input, next-Turn model+effort,
separate work intent and verified operation approval, a fixed provider identity,
and capability-driven choices. These examples use synthetic provider options.
Approval of visual interaction does **not** certify CLI modes, upload transport, sandboxing
or any missing Runtime API. No production code changed as part of these UX ideas.

## 2. Design invariants

- **Provider identity is fixed within a Session** (Claude Code, Codex, Cursor, Antigravity).
  Do not offer a provider switch in Composer; a new Session/handover is a separate product flow.
- **Next Turn configuration** may choose model, available effort and verified execution preset.
  Never silently change an already-running Turn.
- **Message authoring** is the common surface on desktop/mobile. File/image attachments sit
  **above** the text area, inside the Composer boundary, with visible name/preview, removal,
  loading/rejection state, and bounded height when numerous.
- **One model/effort picker** (e.g. “Model · High”) rather than a redundant “Change model” action.
  Effort choices depend on the selected model; omit the effort selector if unsupported.
- The `+` attachment menu can offer locally selected file, selected image, project/repository
  reference and on mobile a camera capture flow. Drag/drop/paste are desktop enhancements.
  A reference to a repository path is not the same as uploading file bytes.
- All pickers are capability-driven and show concrete unavailability reasons, not fictitious
  unsupported actions. A disabled provider/mode should never be represented as a working action.
- Normal Send and provider Question/Permission/Engine Review actions remain distinct channels.
  An operation-approval preset never approves a deterministic Task transition or human review.

## 3. Work intent versus operation approval

Do **not** model Ask/Plan/Agent and Accept All as values of one enum.

| Concern            | Product meaning                                                                           | Boundary                                                 |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Work intent        | Ask: answer/read; Plan: investigate and propose; Agent: perform effects as permitted      | Provider-native capability **only if certified**         |
| Operation approval | Which approved tool operations may proceed without asking; which still require permission | Runtime + provider adapter + sandbox/security boundaries |
| Model/effort       | Selection for next Turn                                                                   | Provider/model capability catalogue                      |
| Workflow decision  | Task completion, review rejection, approval, Engine recovery                              | Deterministic Engine, never Composer approval preset     |

Do not claim a single vendor-neutral `Auto` or `Accept All` maps exactly to all CLIs. A provider's
native `acceptEdits` may only approve edits; another provider's `auto` applies a separate
risk-based policy; Codex combines sandbox with approval policy. A safe auto policy is **not** an
unrestricted bypass. Backend adapter advertises **tested combinations** with explanations; UI
renders those, not the Cartesian product of intent and approval fields.

Ask should be absent/unavailable where read-only answering semantics cannot be enforced.
Plan is not merely a system prompt if the adapter cannot guarantee a non-writing execution.
Guard against unverified unrestricted/bypass execution; never make it the default. Product/Engine
scope, writer admission, user verification, and recovery safeguards remain authoritative.

## 4. Universal Composer, pluggable provider capabilities

Reuse one shared Composer component rather than implementing a separate Composer for each provider.
An adapter/registry is owned **per provider/transport**, not per model. Provider catalogue resolves
effective options per installed CLI/protocol version, selected model, workspace security, and product
policy. A future externally installable provider plugin system is not required for this design.

Illustrative, **non-normative** proposed read projection:

```ts
type ComposerOptions = {
  provider: { id: string; title: string }; // Session-pinned, not editable
  models: { id: string; title: string; efforts: string[]; inputs: ('text' | 'image' | 'file')[] }[];
  presets: {
    id: string;
    title: string;
    intent: 'ask' | 'plan' | 'agent'; // only when semantically certified
    nativeModeId?: string;
    approvalDescription?: string;
    readiness: 'ready' | 'unavailable';
    reason?: string;
    compatibility: 'tested' | 'provisional' | 'unsupported';
  }[];
  attachments: {
    localFiles: boolean;
    images: boolean;
    projectReferences: boolean;
    cameraCapture: boolean; // UI/device availability; requires model image support as well
  };
};
```

UI can group certified presets under Ask / Plan / Agent, and show separate approval choices only
for the effective intent and provider/model. Do not hardcode an identical fixed list of options
for Claude/Codex/Cursor/Antigravity, and do not silently translate a native mode to a false
universal guarantee.

Current Runtime has `CreateSession` / `StartTurn` fields `mode`, `providerModeId`,
`modelId` and `effort`; `StartTurn` can override the next Turn selection without changing
`providerId`. Provider catalogue already exposes `providerModes`, models/efforts, readiness
and compatibility. These are a migration starting point, **not** a certified universal intent
or approval-policy model. Claude and Codex adapters exist; the Cursor adapter and Antigravity
maturity need verification when implementation is scheduled.

## 5. Attachments and model capability contract gaps

The current `StartTurn` HTTP schema has text `message` but no persisted attachment references.
A future contract must distinguish at least:

- local image/file bytes uploaded to authorized temporary storage, with stable upload ID,
  MIME/size, expiration, user-visible failure and safe redaction;
- project/repository file reference with trusted project identity, path, revision or snapshot
  semantics, access guard and no implicit byte-copy assumption;
- camera/photo/gallery selection on mobile, subject to browser/device access;
- model/adapter support for binary/multimodal inputs, with truthful rejection and retry.

Sending text must not silently drop a rejected or unsupported attachment. Draft/attachment
state survives local navigation as appropriate, respects limits and cleans up abandoned uploads.

## 6. Composer UI behavior (V10 approved direction, styling provisional)

- Visual order inside Composer: attachments / previews -> multiline message -> toolbar.
- Toolbar contains `+`, one intent/preset entry, conditional operation policy entry, one
  model+effort selector, and primary Send. Provider identity can be static context,
  not another picker.
- Menus expose only tested options; unavailable cases carry explanatory reasons.
- Composer updates are independent of Secondary tabs, context navigation and panel split size.
  Ensure the real control remains usable at minimum Conversation width and on mobile keyboard.
- Interactive HTML examples use **synthetic provider/model options**, simulated attachment
  chips and a simulated Send. They do not upload files, execute commands, check live capabilities
  or claim real provider safety guarantees.

## 7. Implementation and capability decisions still open

1. DS-compliant iconography and responsive density: replace unrecognized mobile glyphs,
   avoid toolbar overflow/wrap, test at 390px and smaller supported sizes, keyboard and touch.
2. Whether operation approval is a separate visible selector for a provider with one policy
   (probably hide it) or how to expose provider-native fine-grained variants.
3. Exact certified Ask/Plan mappings per provider and installed CLI version.
4. Whether an option is provisionally shown disabled with an explanation or omitted entirely.
5. Upload UI lifecycle, previews, size constraints and cross-session draft persistence.
6. Whether mobile camera choice is displayed as a separate item or folded into image selection.
7. Keyboard/paste/drop interactions, focus, live state and composer disabling during interactions.
8. Any provider-specific policy risks where named modes cannot be matched to stable guarantees.

## 8. Next work

UX: implement approved V10 interactions with shared DS components; correct mobile icons,
wrapping, and minimum-size/soft-keyboard behavior before visual signoff.

Runtime/Engine: map each provider native mode/permission preset to verified sandbox/effects,
catalogue model-specific input capabilities, upload transport, trusted file references, and
Turn admission. Treat unknown/unavailable as unsupported, never as implicit full auto.

Implementation: after UX approval, update the canonical Session UI spec and select vertical slices
with tests; do not treat this idea document or synthetic HTML as approval to ship all behaviors.
