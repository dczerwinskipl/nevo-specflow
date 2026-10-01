---
id: ideas.specflow-ui.components.settings-catalog-renderer
type: product
title: Settings catalog renderer UI spec
status: draft
scope: specflow
areas:
  - ui
  - configuration
tags:
  - settings
  - catalog
  - renderer
  - plugins
  - fields
read_when:
  - implementing dynamic Project Settings rendering
  - adding a new Settings value kind
  - creating Storybook/Figma fixtures for Settings descriptors
summary: >
  Detailed renderer contract for backend-owned Settings descriptors: supported value kinds,
  provenance/default/effective state, availability/read-only/sensitive handling, plugin contributions,
  unknown descriptor behavior, payload-backed fixtures, data loading and visual rules.
related:
  - ideas.specflow-ui.components
  - ideas.specflow-ui.screens.project-settings
  - ideas.specflow-ui.data-loading-refresh-and-eventing
  - design-system.principles.layout-and-containment
---

# Settings catalog renderer UI spec

## 1. Responsibility

The Settings catalog renderer turns a semantic backend/application Settings catalog into a usable,
linear Project Settings UI.

The renderer owns presentation. It does not own the inventory of settings, section/group ordering,
effective-value precedence, plugin availability truth, backend validation, secret redaction, or
arbitrary plugin-supplied UI markup.

## 2. Component ownership

Product-owned:

~~~text
SettingsCatalog
├── SettingsSectionNavigation
├── SettingsSection
│   └── SettingsGroup
│       └── SettingRow
│           ├── SettingLabel
│           ├── SettingValue
│           ├── SettingProvenance
│           ├── SettingAvailability
│           └── SettingAction
└── UnsupportedSettingNotice
~~~

Use Nevo UI Typography, SideNavigation/Menu/Select, Button/Link, StatusIndicator, Collapsible,
Separator, code surface, and form controls only when editing actually exists.

No generic SettingsCard/ProviderCard/ConfigCard.

## 3. Input descriptor

~~~text
{
  key,
  label,
  description?,
  helpRef?,
  valueKind,
  displayFormat?,
  configuredValue?,
  effectiveValue?,
  defaultValue?,
  valueState?,
  sourceOfValue?,
  sourceRef?,
  options?,
  sensitive?,
  readOnly,
  required?,
  availability?,
  capabilities?
}
~~~

The UI must distinguish configured value, effective value, default value, source/provenance,
availability, editability, and sensitivity.

## 4. General row anatomy

Read-only default:

~~~text
Model
Claude Sonnet 4.5
Inherited from project default                              [source]
~~~

With description:

~~~text
Context capacity
Maximum context used for new Turns.

200k
Project configuration                                     [source]
~~~

Unavailable:

~~~text
Provider
Antigravity
Unavailable · Sign in to use this provider
~~~

Do not render label/value pairs inside Cards.

## 5. Value-kind renderer matrix

| valueKind | Read-only rendering | Future editable control | Notes |
| --- | --- | --- | --- |
| string | text | TextField | displayFormat may change code/path/url treatment |
| number | numeric text | Number/TextField | units belong in descriptor/display format |
| boolean | Enabled/Disabled or Yes/No | Switch/Checkbox | disabled control is wrong for read-only |
| enum | option label | Select/RadioGroup | options supplied by backend |
| multi-enum | concise list | multi-select/Checkbox group | avoid chip soup |
| path | monospace/path + Open | path picker later | workspace-relative preferred |
| url | sanitized link | TextField later | no secret query leakage |
| secret | configured/value-hidden state | secret input later | backend redaction mandatory |
| code | compact code/source | code editor later | long values inspect deeper |
| structured | readable summary + Inspect | structured editor later | no huge JSON dump |
| duration | humanized duration | duration field later | canonical machine value retained |
| size | humanized bytes/count | numeric + unit later | unit supplied semantically |
| status | semantic text/status | usually read-only | no freeform color |
| reference | label + target action | picker later | explicit target semantics |
| list | concise list/summary | list editor later | long lists collapse/inspect |
| unknown | unsupported notice | none | never silently stringify arbitrary object |

A new backend setting using an existing valueKind should not require screen-specific code.

A genuinely new valueKind is a versioned frontend/backend contract extension and needs an explicit
renderer.

## 6. Provenance and value-state rules

Candidate semantics:

~~~text
explicit
inherited
default
unset
unavailable
invalid
~~~

Examples:

~~~text
Model
Claude Sonnet 4.5
Inherited · project default
~~~

~~~text
Model
GPT-5.6
Local override                                             [source]
~~~

~~~text
Default reviewer
Not configured
Uses workflow/runtime fallback
~~~

The UI must not invent inherited/default from missing values. The server supplies valueState and
sourceOfValue.

## 7. Sensitive values

Payload:

~~~json
{
  "key": "github.token",
  "label": "GitHub token",
  "valueKind": "secret",
  "configuredValue": null,
  "effectiveValue": null,
  "valueState": "explicit",
  "sensitive": true,
  "readOnly": true,
  "availability": { "status": "configured" }
}
~~~

Mock:

~~~text
GitHub token
Configured · value hidden
~~~

Never show plaintext, raw serialized secrets, partial secret unless a separate security contract
permits it, or a Copy action for a hidden secret by default.

Redaction happens before UI delivery.

## 8. Boolean rendering

Read-only:

~~~text
Auto review
Enabled
~~~

or:

~~~text
Auto review
Disabled
~~~

Do not show read-only booleans as disabled Switches. A disabled interactive control looks editable
but blocked and adds visual noise.

Use Switch only in an actual edit flow.

## 9. Enum and options

Payload:

~~~json
{
  "key": "ai.defaultProvider",
  "label": "Default provider",
  "valueKind": "enum",
  "effectiveValue": "claude",
  "valueState": "explicit",
  "options": [
    { "value": "claude", "label": "Claude" },
    {
      "value": "antigravity",
      "label": "Antigravity",
      "disabled": true,
      "disabledReason": "Provider is not signed in."
    }
  ],
  "readOnly": true
}
~~~

Read-only:

~~~text
Default provider
Claude
~~~

Deeper option inspection may show:

~~~text
Claude
Antigravity · unavailable — Provider is not signed in
~~~

The UI does not maintain its own provider label/availability registry.

## 10. Path/reference rendering

Payload:

~~~json
{
  "key": "project.config",
  "label": "Project configuration",
  "valueKind": "path",
  "effectiveValue": "nevo.yaml",
  "sourceRef": {
    "kind": "workspace-file",
    "path": "nevo.yaml"
  },
  "capabilities": {
    "canInspectSource": true
  },
  "readOnly": true
}
~~~

Mock:

~~~text
Project configuration
nevo.yaml                                                   [View]
~~~

Use contextual File/source inspection.

## 11. Structured/code value

Short:

~~~text
Ignored paths
node_modules
dist
.cache
~~~

Long:

~~~text
Ignored paths
12 entries                                                  [Inspect]
~~~

Do not render a 200-line JSON/YAML payload inline in normal Settings content.

The descriptor may carry a summary/count plus sourceRef/detailRef.

## 12. Availability states

Candidate statuses:

~~~text
available
configured
not-configured
unavailable
unsupported
error
~~~

Optional not configured:

~~~text
GitLab
Not configured
~~~

Optional unavailable:

~~~text
Antigravity
Unavailable · Sign in required
~~~

Required issue:

~~~text
AI provider
Configuration required
No enabled provider can start a Session.                    [Resolve]
~~~

Unsupported:

~~~text
Feature X
Not supported by this runtime version
~~~

Only a required/actionable issue should normally get stronger attention treatment.

## 13. Plugin/extension contributions

Payload:

~~~json
{
  "id": "acme-ci",
  "title": "ACME CI",
  "source": { "kind": "plugin", "id": "acme-ci" },
  "groups": [
    {
      "id": "connection",
      "title": "Connection",
      "settings": [
        {
          "key": "acme.endpoint",
          "label": "Endpoint",
          "valueKind": "url",
          "effectiveValue": "https://ci.example.com",
          "readOnly": true
        }
      ]
    }
  ]
}
~~~

Render through the same section/group/setting language. No plugin-specific Card styling by default.

A bespoke plugin screen requires a separate explicit UI extension contract.

## 14. Unknown value kind

Payload:

~~~json
{
  "key": "future.setting",
  "label": "Future setting",
  "valueKind": "graph-expression",
  "effectiveValue": { "opaque": true },
  "readOnly": true
}
~~~

Mock:

~~~text
Future setting
Unsupported setting format
This UI version cannot render graph-expression.              [Details]
~~~

Rules:

- fail this setting only;
- keep the section usable;
- never silently omit it;
- never stringify arbitrary unknown data as the normal value;
- diagnostics may expose key/valueKind/schemaVersion.

## 15. Partial plugin failure

Payload:

~~~json
{
  "id": "plugin-x",
  "title": "Plugin X",
  "source": { "kind": "plugin", "id": "plugin-x" },
  "availability": {
    "status": "error",
    "reason": "Plugin failed to provide settings."
  },
  "groups": []
}
~~~

Mock:

~~~text
Plugin X
Settings unavailable
Plugin failed to provide settings.                           [Retry]
~~~

Core Settings remain usable.

## 16. Group layout

~~~text
AI / Agents

Defaults
Default provider       Claude
Default mode           Agent
Context capacity       200k

Providers
Claude                 Available
Antigravity            Unavailable · sign in required

Agent profiles
Implementer            UI / general
Reviewer               Read-only review
~~~

Use aligned rows when it improves scanning.

Do not wrap Defaults, Providers, and Agent profiles each in Cards.

## 17. Editing boundary

Current screen is read-only-first.

When editing arrives, descriptors need explicit validation, dirty-state, write-scope, authorization,
concurrency/revision, reset/default semantics, and save strategy.

Do not expose disabled edit controls now as placeholders.

A future mutation should likely include an expected revision:

~~~text
PATCH /api/project/settings

{
  expectedRevision,
  changes: [
    { key, value }
  ]
}
~~~

Server returns a new authoritative catalog/revision or conflict.

Exact write API remains deferred until edit semantics are designed.

## 18. Data loading

One catalog request returns sections, groups, descriptors, lightweight values/provenance/availability.

Do not make one HTTP request per setting or plugin.

Heavy source/code/detail bodies remain independent and lazy.

Plugin contributions are composed server-side so the UI has one coherent catalog revision.

## 19. Refresh

One Project Settings Refresh refreshes catalog revision/effective values.

Local source/detail Retry remains scoped to that resource.

Do not refresh Session/Spec runtime domains because Settings refreshed.

## 20. Visual/token contract

- page/group structure: typography + spacing first;
- labels: primary/secondary according to hierarchy;
- values: primary content;
- provenance: muted;
- unavailable reason: muted or warning based on impact;
- required configuration issue: semantic attention;
- secret state: neutral protected state;
- code/path: monospace where useful;
- no plugin brand colors unless product-approved.

## 21. Containment rules

- no Card per setting;
- no Card per group;
- no Card per plugin/provider;
- simple label/value rows first;
- divider only when needed;
- one action-required issue may use stronger containment;
- code/raw source may use one code surface;
- unknown descriptor is a local error row, not a giant error Card.

## 22. Fixture payload matrix

The following descriptors are the minimum concrete payloads for renderer fixtures. Shared catalog
fields such as section/group ids are omitted only because the renderer under test receives one
Setting descriptor.

### string

~~~json
{
  "key": "project.name",
  "label": "Project name",
  "valueKind": "string",
  "effectiveValue": "Nevo SpecFlow",
  "valueState": "explicit",
  "readOnly": true
}
~~~

### number

~~~json
{
  "key": "ai.maxRetries",
  "label": "Maximum retries",
  "valueKind": "number",
  "effectiveValue": 3,
  "valueState": "explicit",
  "readOnly": true
}
~~~

### boolean

~~~json
{
  "key": "review.auto",
  "label": "Automatic review",
  "valueKind": "boolean",
  "effectiveValue": true,
  "valueState": "explicit",
  "readOnly": true
}
~~~

Disabled fixture uses the same payload with `effectiveValue: false`.

### multi-enum

~~~json
{
  "key": "review.requiredRoles",
  "label": "Required roles",
  "valueKind": "multi-enum",
  "effectiveValue": ["reviewer", "security"],
  "valueState": "explicit",
  "options": [
    { "value": "reviewer", "label": "Reviewer" },
    { "value": "security", "label": "Security" },
    { "value": "owner", "label": "Owner" }
  ],
  "readOnly": true
}
~~~

### url

~~~json
{
  "key": "integration.endpoint",
  "label": "Endpoint",
  "valueKind": "url",
  "effectiveValue": "https://ci.example.com",
  "valueState": "explicit",
  "readOnly": true
}
~~~

### code

~~~json
{
  "key": "workflow.condition",
  "label": "Condition",
  "valueKind": "code",
  "displayFormat": "javascript",
  "effectiveValue": "ctx.tests.passed && ctx.review.approved",
  "valueState": "explicit",
  "readOnly": true
}
~~~

Long-code fixture uses a large value plus a semantic `sourceRef/detailRef` and should collapse to
summary + Inspect.

### structured

~~~json
{
  "key": "workflow.policy",
  "label": "Workflow policy",
  "valueKind": "structured",
  "effectiveValue": {
    "requiredChecks": ["test", "review"],
    "allowResume": true
  },
  "valueState": "explicit",
  "readOnly": true
}
~~~

Normal view shows a concise summary + Inspect, not raw JSON.

### duration

~~~json
{
  "key": "runtime.timeoutMs",
  "label": "Runtime timeout",
  "valueKind": "duration",
  "effectiveValue": 120000,
  "displayFormat": "milliseconds",
  "valueState": "explicit",
  "readOnly": true
}
~~~

### size

~~~json
{
  "key": "ai.contextCapacity",
  "label": "Context capacity",
  "valueKind": "size",
  "effectiveValue": 200000,
  "displayFormat": "tokens",
  "valueState": "explicit",
  "readOnly": true
}
~~~

### status

~~~json
{
  "key": "provider.claude.status",
  "label": "Claude",
  "valueKind": "status",
  "effectiveValue": "available",
  "availability": { "status": "available" },
  "readOnly": true
}
~~~

### reference

~~~json
{
  "key": "workflow.default",
  "label": "Default workflow",
  "valueKind": "reference",
  "effectiveValue": {
    "id": "workflow-implementation",
    "label": "Implementation"
  },
  "capabilities": { "canInspectSource": true },
  "readOnly": true
}
~~~

### list

~~~json
{
  "key": "repository.ignoredPaths",
  "label": "Ignored paths",
  "valueKind": "list",
  "effectiveValue": ["node_modules", "dist", ".cache"],
  "valueState": "explicit",
  "readOnly": true
}
~~~

### inherited/default/unset

Inherited:

~~~json
{
  "key": "ai.model",
  "label": "Model",
  "valueKind": "string",
  "configuredValue": null,
  "effectiveValue": "Claude Sonnet 4.5",
  "defaultValue": "Claude Sonnet 4.5",
  "valueState": "inherited",
  "sourceOfValue": { "kind": "project-default" },
  "readOnly": true
}
~~~

Default uses `valueState: "default"`; unset uses `valueState: "unset"` with no effective value and
an optional explanation/provenance supplied by the server.

### unavailable optional

~~~json
{
  "key": "provider.antigravity",
  "label": "Antigravity",
  "valueKind": "status",
  "effectiveValue": "unavailable",
  "availability": {
    "status": "unavailable",
    "reason": "Sign in required"
  },
  "required": false,
  "readOnly": true
}
~~~

### required issue

~~~json
{
  "key": "ai.provider",
  "label": "AI provider",
  "valueKind": "status",
  "effectiveValue": "not-configured",
  "availability": {
    "status": "not-configured",
    "reason": "No enabled provider can start a Session."
  },
  "required": true,
  "capabilities": {
    "canEdit": true
  },
  "readOnly": false
}
~~~

Plugin and unknown-kind fixture payloads are defined in sections 13–15.

## 23. Storybook/Figma matrix

Required:

~~~text
settings-renderer/string
settings-renderer/number
settings-renderer/boolean-enabled
settings-renderer/boolean-disabled
settings-renderer/enum
settings-renderer/multi-enum
settings-renderer/path
settings-renderer/url
settings-renderer/secret-configured
settings-renderer/code-short
settings-renderer/code-long
settings-renderer/structured
settings-renderer/duration
settings-renderer/size
settings-renderer/status
settings-renderer/reference
settings-renderer/list
settings-renderer/inherited
settings-renderer/default
settings-renderer/unset
settings-renderer/unavailable-optional
settings-renderer/required-issue
settings-renderer/plugin-section
settings-renderer/plugin-failed
settings-renderer/unknown-value-kind
~~~

Every fixture uses a concrete descriptor payload.

## 24. Acceptance criteria

1. Ordinary new settings using known valueKinds render without screen-specific code.
2. Unknown valueKind fails locally and visibly.
3. Read-only booleans do not masquerade as disabled editable controls.
4. Effective/configured/default/provenance remain distinct.
5. Secrets cannot fall through to plaintext.
6. Optional unavailability does not become page-level alarm.
7. Plugin settings use the same hierarchy as core settings.
8. Heavy structured/source content remains lazy.
9. No setting/group/plugin Card soup.
10. Backend remains semantic; it does not send UI component/layout instructions.
