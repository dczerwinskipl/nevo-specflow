/**
 * Demo-only "Composer options" projection: a local, hand-authored stand-in for the illustrative,
 * explicitly non-normative `ComposerOptions.presets` shape from session-composer-design.md §4
 * (the same doc's `attachments`/`models` fields are already covered by `ModelEffortPicker` and
 * `ManagedSession.tsx`'s own attachment chips — this file is presets/operation-policy only).
 *
 * There is no backend provider catalogue for intent presets or operation policies yet — §7 items
 * 2-3 (whether operation approval needs its own selector at all, and the exact certified
 * Ask/Plan/Agent mapping per provider) are explicitly still-open implementation decisions. This
 * gives the Composer toolbar (§6: "+", one intent/preset entry, conditional operation policy
 * entry, one model+effort selector, Send) something honest and provider-aware to render instead
 * of a non-functional placeholder, the same role `sessionTelemetry.ts` plays for telemetry ahead
 * of its own real contract. Do not treat this as a certified contract or extend it with options
 * no provider actually offers — swap it for the real provider-reported catalogue once §7 is
 * resolved and Runtime exposes it.
 *
 * `id`/`intent` double as the i18n key segment the picker resolves
 * (`managedSession.intent.preset.<intent>`, `managedSession.policy.option.<id>` /
 * `.<id>Description`) via a template literal at the call site, the same
 * `t(\`namespace.${dynamicPart}\`)` convention every other dynamic label in this feature already
 * uses (`ManagedSession.tsx`'s own `entry.${entry.kind}` and `WorkInspector.tsx`'s
 * `workState.${item.state}`) — never a precomputed key string. Both fields are kept as closed
 * literal unions, not `string`, for the same reason those other call sites work and a generic
 * `string` would not: the generated translation-key union can only statically match a template
 * literal built from a finite set of literal types.
 */

export type ComposerIntent = 'ask' | 'plan' | 'agent';

export interface ComposerPreset {
  intent: ComposerIntent;
  readiness: 'ready' | 'unavailable';
  reason?: string;
}

export type ComposerOperationPolicyId = 'askEachTime' | 'acceptEdits';

export interface ComposerOperationPolicy {
  id: ComposerOperationPolicyId;
  /** Whether `managedSession.policy.option.<id>Description` exists for this option. */
  hasDescription?: boolean;
}

export interface ComposerOptions {
  presets: ComposerPreset[];
  /** Keyed by preset `intent`. Only ever consulted for an `'agent'`-intent preset (§3: operation
   * approval is meaningful only once the agent may perform effects) — §7 item 2 says a provider
   * with a single policy should probably not show this as a separate selector at all, which is
   * why an empty/single-entry array here means "render nothing", not "render a disabled picker". */
  operationPoliciesByPreset: Partial<Record<ComposerIntent, ComposerOperationPolicy[]>>;
}

const noPresets: ComposerOptions = { presets: [], operationPoliciesByPreset: {} };

/**
 * Demo catalogue keyed by `ProviderDescriptor.providerId`. An unknown/undefined provider offers no
 * presets, matching `ModelEffortPicker`'s own "render nothing without a known provider" rule — a
 * provider this demo has no mapping for is treated as not having certified any preset yet, never
 * as silently offering every option.
 */
export function demoComposerOptions(providerId: string | undefined): ComposerOptions {
  if (providerId === 'claude-code' || providerId === 'mock') {
    return {
      presets: [
        { intent: 'ask', readiness: 'ready' },
        { intent: 'plan', readiness: 'ready' },
        { intent: 'agent', readiness: 'ready' },
      ],
      operationPoliciesByPreset: {
        agent: [{ id: 'askEachTime' }, { id: 'acceptEdits', hasDescription: true }],
      },
    };
  }

  return noPresets;
}
