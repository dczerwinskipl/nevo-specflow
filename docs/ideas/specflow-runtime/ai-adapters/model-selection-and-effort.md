---
id: ideas.specflow-runtime.ai-adapters.model-selection-effort
type: engineering
title: Model selection and reasoning effort
status: draft
scope: specflow
areas:
  - ai
  - runtime
  - ui
  - testing
tags:
  - providers
  - models
  - reasoning
  - configuration
read_when:
  - implementing provider model discovery
  - building a model picker or reasoning-effort selector
  - migrating model and effort configuration from legacy Nevo
summary: >
  Keep provider model identity separate from reasoning effort, prefer authoritative per-model
  metadata when available, preserve unknown traits instead of guessing, and avoid presenting a
  Cartesian product of model and effort combinations when the provider exposes effort separately.
related:
  - ideas.specflow-runtime.ai-adapters
  - ideas.specflow-runtime.ai-adapters.provider-readiness-auth
  - ideas.specflow-runtime.ai-adapters.diagnostics-and-replay
  - architecture.ai.provider-boundary
---

# Model selection and reasoning effort

## Goal

Do not encode inference tuning into model identity unless the provider itself makes it part of the
authoritative model ID.

Preferred neutral UX:

```text
Model:  [gpt-...]
Effort: [Default | Low | Medium | High | ...]
```

rather than:

```text
gpt-...-low
gpt-...-medium
gpt-...-high
...
```

when the provider actually accepts `model` and `effort` as separate fields.

## Existing neutral contract is already suitable

Legacy Nevo already has the useful shape:

```text
AgentModelDescriptor
  id
  label
  isDefault?
  source
  traits?
    supportsReasoning?
    supportedReasoningEfforts?
    defaultReasoningEffort?
    inputModalities?
    supportsVision?
    maxContextTokens?
```

This should be preserved during migration.

Important semantics:

- missing trait = unknown;
- unknown != false;
- catalog metadata is a pre-turn affordance, not authority over runtime output;
- explicit provider runtime evidence always wins.

## Codex: use native per-model metadata

This is the strongest case.

The legacy Codex app-server integration already calls native `model/list` and receives per-model
metadata including:

```text
id
displayName
isDefault
inputModalities
supportedReasoningEfforts
defaultReasoningEffort
```

Therefore migration should preserve:

```text
native model/list
  -> AgentModelDescriptor[]
  -> selected model
  -> selected model.traits.supportedReasoningEfforts
  -> separate effort selector
```

### Example

Provider metadata:

```json
{
  "id": "model-a",
  "displayName": "Model A",
  "isDefault": true,
  "supportedReasoningEfforts": ["low", "medium", "high"],
  "defaultReasoningEffort": "medium",
  "inputModalities": ["text"]
}
```

UI:

```text
Model
  Model A

Reasoning effort
  Provider default (medium)
  Low
  Medium
  High
```

Runtime:

```text
model selected, effort omitted -> provider default
model selected, effort=high    -> send model + effort=high
```

Do not expand this into three catalog entries.

### Unknown/custom Codex model

Keep permissive passthrough.

If the user enters a custom model ID for which no metadata exists:

- model is allowed through;
- supported efforts are unknown;
- do not claim every known effort is supported;
- advanced UI MAY allow an explicit manual effort value/pass-through if product UX wants it;
- provider remains the final validator.

### Compatibility aliases

A small explicit alias map can be justified when the provider has deprecated a known alias and a
concrete replacement is verified.

Do not normalize arbitrary model strings by pattern.

## Claude: separate model and effort using curated evidence

Claude CLI accepts model and effort separately, but does not provide an equivalent authoritative
local `model/list` command.

Therefore model discovery and effort traits require weaker sources:

1. configured/operator metadata;
2. curated/versioned known metadata;
3. provider API discovery when credentials and API semantics make that available;
4. unknown.

### Curated effort metadata can be useful

A provider-specific helper may express verified/documented support such as:

```text
model X -> low, medium, high
model Y -> low, medium, high, max
model Z -> no effort override
```

This is still better than creating one model row per effort.

The catalog entry should mark this data as curated/configured rather than discovered from the CLI.

### Verify CLI capability separately

Model metadata and installed CLI capability are two different facts.

A selected model may require a minimum CLI version. Likewise, older CLI builds may not expose
`--effort`.

The readiness/diagnostic lane should therefore be able to report:

```text
selected model requires newer CLI
configured effort unsupported by installed CLI
```

before a real Turn starts.

This does not change the model catalog; it validates the selected configuration against the
execution environment.

### Do not infer from a global flag

The mere existence of:

```text
claude --effort ...
```

does not prove that every model supports every effort value.

Per-model effort lists require per-model evidence.

## Antigravity: preserve provider model IDs exactly

This provider is the tricky case.

Observed `agy models` output has included IDs such as:

```text
gemini-3.8-flash-high
gemini-3.1-pro-high
claude-sonnet-4-6
gpt-oss-120b-medium
```

At the same time the CLI also supports a separate global `--effort` option.

Those facts do **not** prove that:

```text
gemini-3.8-flash-high
```

is structurally:

```text
base model = gemini-3.8-flash
effort = high
```

for every provider/model family.

A suffix may be part of the provider's actual model ID.

### Migration rule

Until provider evidence exposes the relationship explicitly:

- preserve the returned ID byte-for-byte as model identity;
- do not strip `-low`, `-medium`, `-high`, etc.;
- do not merge apparently related IDs;
- leave `supportedReasoningEfforts` unknown when `agy models` only returns ID + label;
- `--effort` proves transport syntax, not per-model capability.

### Future grouping

If later provider evidence proves model-family/variant relationships, the adapter may expose
additional neutral metadata, for example conceptually:

```text
familyId?
variant?
supportedReasoningEfforts?
```

or simply collapse verified variants into one canonical catalog entry while retaining the exact
provider ID used on the wire.

That change must be evidence-backed. Do not implement grouping by suffix regex.

## Default effort

Prefer an explicit UI sentinel such as:

```text
Provider default
```

which means the Runtime omits the effort override.

Do not eagerly serialize the provider's current default as an explicit override unless the user
selected it. Otherwise a future provider default change cannot take effect.

`defaultReasoningEffort` is useful for display/explanation, but omission and explicit selection
remain distinct.

## Session vs Turn overrides

Where the provider supports it, model/effort selection should have clear precedence:

```text
explicit Turn override
  > Session preference
  > provider default
```

Do not duplicate `effort` and `reasoningEffort` as two independent semantic settings. Accept
legacy aliases at the compatibility boundary if required, normalize them once, and carry one neutral
value internally.

## Model catalog sources

Suggested evidence strength:

1. provider-native model protocol/API with per-model metadata;
2. provider-native model listing with ID/label only;
3. versioned curated metadata from provider documentation;
4. operator configuration;
5. manual/unlisted passthrough.

Expose source/provenance so UI and validation know whether a trait is authoritative or advisory.

## Refresh and caching

Dynamic discovery should have:

- bounded timeout;
- short cache;
- explicit refresh/bypass;
- last-known-good fallback when appropriate;
- no requirement for full session creation merely to populate the picker.

A discovery failure should not delete curated/configured fallback models.

## Interaction with authentication

Model discovery and auth readiness are related but not identical.

Examples:

- Codex native model listing may require an initialized/authenticated app-server;
- Claude API model discovery may require API-key auth while a subscription CLI login still works;
- Antigravity model listing may or may not prove inference auth.

Do not mark a provider logged out simply because an optional model-discovery source failed.

## Verification cases

1. Codex model with three efforts appears once in the catalog, not three times;
2. changing model immediately changes available effort options;
3. provider default means no explicit effort is sent;
4. unsupported effort from authoritative metadata is rejected or prevented before launch;
5. unknown/manual model remains pass-through with effort traits unknown;
6. Claude CLI version too old for configured effort is reported by readiness check;
7. Antigravity IDs ending in `-high` remain unchanged without evidence-backed grouping;
8. global `--effort` support does not manufacture per-model traits;
9. dynamic discovery failure retains safe curated/configured fallback;
10. runtime reasoning output is accepted even when catalog traits were unknown.
