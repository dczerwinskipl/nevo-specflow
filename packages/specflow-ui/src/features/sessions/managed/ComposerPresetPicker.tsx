import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Workflow } from 'lucide-react';
import {
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@nevo/ui';
import type { ComposerIntent, ComposerOperationPolicyId, ComposerOptions } from './composerOptions';

/** Opaque Select-style value encoding an intent + its (optional) operation-policy sub-choice. */
export interface ComposerModeValue {
  intent: ComposerIntent;
  operationPolicyId?: ComposerOperationPolicyId;
}

/**
 * Flattens intent presets into the picker's "Tryb pracy" section rows — one row per preset, never
 * per preset+policy pair (see this file's own doc comment, owner audit round five). `policies`
 * carries whichever operation policies that preset actually offers; `hasPolicies` says whether
 * picking it should reveal the "Approval mode" section below — a preset with fewer than 2 policies
 * (§7 item 2: a provider with only one policy should not show it as a separate choice at all)
 * never shows that section, mirroring this file's own long-standing single-/no-policy collapse.
 */
function presetSectionItems(options: ComposerOptions) {
  return options.presets.map((preset) => {
    const policies = options.operationPoliciesByPreset[preset.intent] ?? [];

    return {
      intent: preset.intent,
      readiness: preset.readiness,
      policies,
      hasPolicies: policies.length > 1,
    };
  });
}

/**
 * `policy.id`'s description key, per literal case rather than a `${id}Description` template: a
 * template union here would statically require every id's `...Description` key to exist whether
 * or not the demo catalogue's own `hasDescription` flag says so for that entry — an explicit
 * switch only ever names a key that is actually declared in the locale files, independent of
 * which entries the current catalogue happens to flag.
 */
function policyDescription(id: ComposerOperationPolicyId, t: TFunction): string | undefined {
  switch (id) {
    case 'acceptEdits':
      return t('managedSession.policy.option.acceptEditsDescription');
    case 'askEachTime':
      return t('managedSession.policy.option.askEachTimeDescription');
  }
}

/**
 * Every intent preset's own description, keyed directly off the closed `ComposerIntent` union
 * (owner audit, round six: "Ponieważ zbiór trybów jest skończony, można mapować ich identyfikatory
 * na tłumaczone etykiety i opisy" — the preset set is fixed, so each one's description comes from
 * this app's own i18n catalogue, never from the provider/catalogue data itself, the same way
 * `policyDescription` above already resolves policy descriptions by id rather than expecting the
 * demo catalogue to carry display copy). Unlike `policyDescription`, there is no `hasDescription`
 * gate here — every preset in the closed union has one.
 */
function presetDescription(intent: ComposerIntent, t: TFunction): string {
  switch (intent) {
    case 'ask':
      return t('managedSession.intent.preset.askDescription');
    case 'plan':
      return t('managedSession.intent.preset.planDescription');
    case 'agent':
      return t('managedSession.intent.preset.agentDescription');
  }
}

/**
 * The Composer toolbar's combined "Tryb pracy" entry (session-composer-design.md §6/§3): work
 * intent (Ask/Plan/Agent), and — only for whichever preset actually has more than one demo
 * operation policy (currently just Agent) — that preset's own operation-approval choice, both in
 * ONE popover instead of two separate pickers (owner audit, round five: see this file's own doc
 * comment for why). Distinct from the Model/effort picker. Renders nothing without a ready preset
 * — demo catalogue, see `composerOptions.ts`.
 *
 * Icon: `Workflow`, not `Bot` (owner audit, live: a real user read the robot glyph as "this is
 * where I pick the model" and could not find the actual Model/effort picker sitting right next to
 * it — see `ModelEffortPicker`'s own doc comment, which picked up the `Bot` icon this picker gave
 * up, for the other half of that fix). `Workflow` reads as "mode/process" without any AI
 * connotation, so the two ghost icon buttons no longer compete for the same "this is the AI one"
 * read.
 *
 * `compact` stays icon-only here, unlike `ModelEffortPicker`'s own compact trigger (owner audit,
 * round five: live-checked the full toolbar — attach + this + Model/effort + Send — together at
 * the narrowest supported width). Once a policy sub-choice is selected the combined label reads
 * e.g. "Agent · Automatyczne edycje": next to `ModelEffortPicker`'s own now-visible
 * "<Model> · <effort>" text, a second full text label genuinely does not fit the row at 375px
 * without wrapping the toolbar onto an extra line or crowding Send off the visible row. Model/
 * effort keeps its text because a real user specifically could not find THAT picker; this one, an
 * icon with `aria-label`/`title` set to the full combined label, has not shown the same problem —
 * a deliberate width-constrained call, not an unexamined default.
 *
 * Same `Menu`/`MenuRadioGroup` shape — and same `MenuTrigger asChild` requirement that its direct
 * child forward a ref (`IconButton`/`Button` themselves, not an extra wrapping component) — as
 * `ModelEffortPicker`. The compact (icon-only) trigger is a bare `IconButton` directly under
 * `MenuTrigger asChild`, not also wrapped in a `Tooltip`/`TooltipTrigger` (confirmed live, owner
 * audit on a real phone: two nested Radix `asChild` triggers — `MenuTrigger` and `TooltipTrigger`,
 * both cloning onto the same `IconButton` — silently ate the open-on-tap interaction; the same bug
 * existed in `ModelEffortPicker`'s own compact trigger, fixed there too). A `title` attribute
 * gives desktop mouse users the same hover hint `Tooltip` would have, with no composition risk;
 * `aria-label` alone already covers assistive tech.
 *
 * Owner audit, round five — the popover itself now mirrors `ModelEffortPicker`'s own two-section
 * shape (Antigravity reference): "Tryb pracy", then — only for a preset with more than one policy
 * — "Approval mode", in ONE popover instead of a flattened list of "Intent · policy" rows. Picking
 * a preset with more than one policy keeps the popover open (`MenuRadioItem`'s own `onSelect`
 * calling `event.preventDefault()`, the documented Radix mechanism for suppressing a
 * `DropdownMenu` item's default close-on-select) so the policy section can be refined in the same
 * open menu; picking a preset with 0-1 policies, or picking the policy itself, closes normally.
 * Every preset pick still fires a complete `onChange` immediately (keeping the previously selected
 * policy when the new preset still offers it, else falling back to that preset's first policy).
 *
 * Owner audit, round six: both sections now show a description under every row, not just
 * Approval-mode — the Tryb-pracy section's own rows get one too (`presetDescription`, see that
 * function's own doc comment for why this is a closed-union i18n lookup rather than data the
 * provider/catalogue supplies), and `acceptEdits`'/`askEachTime`'s own labels were shortened
 * (full explanation moved into their respective `...Description` keys) so a long explanation no
 * longer has to double as the row's primary label. Both sections use the exact same
 * `MenuRadioItem` for every row either way, so the shared label/description/checkmark-column
 * layout is guaranteed by construction, not by a per-section style override.
 */
export function ComposerModePicker({
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  options: ComposerOptions;
  value: ComposerModeValue | undefined;
  onChange: (value: ComposerModeValue) => void;
  disabled?: boolean;
  /** Collapses to an icon-only trigger on the narrow/mobile layout — see this component's own doc
   * comment for why, unlike `ModelEffortPicker`'s own `compact`, this one stays icon-only. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const items = useMemo(() => presetSectionItems(options), [options]);
  if (items.length === 0) {
    return null;
  }

  const selectedPreset = items.find((item) => item.intent === value?.intent);
  const selectedPolicy = selectedPreset?.policies.find(
    (policy) => policy.id === value?.operationPolicyId,
  );
  const presetLabel = selectedPreset
    ? t(`managedSession.intent.preset.${selectedPreset.intent}`)
    : undefined;
  const policyLabel = selectedPolicy
    ? t(`managedSession.policy.option.${selectedPolicy.id}`)
    : undefined;
  const triggerLabel = presetLabel
    ? policyLabel
      ? `${presetLabel} · ${policyLabel}`
      : presetLabel
    : t('managedSession.intent.placeholder');
  const showPolicySection = selectedPreset?.hasPolicies ?? false;

  return (
    <Menu>
      <MenuTrigger asChild>
        {compact ? (
          <IconButton
            aria-label={triggerLabel}
            disabled={disabled}
            icon={Workflow}
            id="managed-intent"
            size="sm"
            title={triggerLabel}
            variant="ghost"
          />
        ) : (
          <Button
            className="max-w-40 sm:max-w-56"
            disabled={disabled}
            id="managed-intent"
            labelOverflow="truncate"
            leadingIcon={Workflow}
            trailingIcon={ChevronDown}
            size="sm"
            variant="ghost"
          >
            {triggerLabel}
          </Button>
        )}
      </MenuTrigger>
      <MenuContent align="start" aria-label={t('managedSession.intent.label')}>
        <MenuLabel>{t('managedSession.intent.sectionLabel')}</MenuLabel>
        {/* `onValueChange` deliberately omitted (optional on `MenuRadioGroup`): real selection
            happens in each item's own `onSelect` below, which also decides whether to keep the
            menu open — `onValueChange` alone cannot `preventDefault()` the close Radix already
            started by the time it fires. */}
        <MenuRadioGroup value={selectedPreset?.intent ?? ''}>
          {items.map((item) => (
            <MenuRadioItem
              key={item.intent}
              value={item.intent}
              description={presetDescription(item.intent, t)}
              disabled={item.readiness === 'unavailable'}
              onSelect={(event) => {
                const currentPolicyId = value?.operationPolicyId;
                const nextPolicyId = item.hasPolicies
                  ? currentPolicyId && item.policies.some((policy) => policy.id === currentPolicyId)
                    ? currentPolicyId
                    : item.policies[0]?.id
                  : undefined;
                onChange({ intent: item.intent, operationPolicyId: nextPolicyId });
                if (item.hasPolicies) {
                  // Keep the popover open so the just-revealed "Approval mode" section below can
                  // be refined without reopening the menu (owner audit, round five).
                  event.preventDefault();
                }
              }}
            >
              {t(`managedSession.intent.preset.${item.intent}`)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        {showPolicySection && selectedPreset ? (
          <>
            <MenuSeparator />
            <MenuLabel>{t('managedSession.policy.sectionLabel')}</MenuLabel>
            <MenuRadioGroup value={value?.operationPolicyId ?? ''}>
              {selectedPreset.policies.map((policy) => (
                <MenuRadioItem
                  key={policy.id}
                  value={policy.id}
                  description={policy.hasDescription ? policyDescription(policy.id, t) : undefined}
                  onSelect={() =>
                    onChange({ intent: selectedPreset.intent, operationPolicyId: policy.id })
                  }
                >
                  {t(`managedSession.policy.option.${policy.id}`)}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
