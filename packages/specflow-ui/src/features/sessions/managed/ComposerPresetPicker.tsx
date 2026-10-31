import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Workflow } from 'lucide-react';
import {
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@nevo/ui';
import type { ComposerIntent, ComposerOperationPolicyId, ComposerOptions } from './composerOptions';

/** Opaque Select-style value encoding an intent + its (optional) operation-policy sub-choice. */
export interface ComposerModeValue {
  intent: ComposerIntent;
  operationPolicyId?: ComposerOperationPolicyId;
}

function encodeModeKey(intent: ComposerIntent, operationPolicyId?: ComposerOperationPolicyId) {
  return JSON.stringify(operationPolicyId ? [intent, operationPolicyId] : [intent]);
}

function decodeModeKey(key: string): ComposerModeValue {
  const [intent, operationPolicyId] = JSON.parse(key) as [
    ComposerIntent,
    ComposerOperationPolicyId?,
  ];

  return operationPolicyId ? { intent, operationPolicyId } : { intent };
}

/**
 * `policy.id`'s description key, per literal case rather than a `${id}Description` template:
 * the template union here would have to include every id's `...Description` key regardless of
 * `hasDescription`, including `askEachTimeDescription`, which does not exist — an explicit switch
 * only ever names a key that is actually declared in the locale files.
 */
function policyDescription(id: ComposerOperationPolicyId, t: TFunction): string | undefined {
  switch (id) {
    case 'acceptEdits':
      return t('managedSession.policy.option.acceptEditsDescription');
    case 'askEachTime':
      return undefined;
  }
}

/**
 * Flattens intent presets and their (per-preset) operation policies into ONE list of selectable
 * rows, exactly the same "flatten the dependent sub-choice into the parent choice's own list"
 * trick `ModelEffortPicker.tsx`'s own `modelPickerItems` already uses for Model → effort (owner
 * audit: "Ten sam myk z jedną listą menu, gdzie po wybraniu agent mode pojawiają się pod opcje
 * (coś jak effort do claude sonnet)" — the same trick as Model → effort, applied to intent →
 * operation policy). A preset with fewer than 2 policies (§7 item 2: a provider with only one
 * policy should not show it as a separate choice at all) collapses to a single row, just the
 * preset itself — mirrors `modelPickerItems`' own single-/no-effort collapse.
 */
function composerModeItems(options: ComposerOptions, t: TFunction) {
  return options.presets.flatMap((preset) => {
    const policies = options.operationPoliciesByPreset[preset.intent] ?? [];
    const presetLabel = t(`managedSession.intent.preset.${preset.intent}`);

    if (policies.length < 2) {
      return [
        {
          key: encodeModeKey(preset.intent),
          label: presetLabel,
          description: undefined,
          readiness: preset.readiness,
        },
      ];
    }

    return policies.map((policy) => ({
      key: encodeModeKey(preset.intent, policy.id),
      label: presetLabel + ' · ' + t(`managedSession.policy.option.${policy.id}`),
      description: policy.hasDescription ? policyDescription(policy.id, t) : undefined,
      readiness: preset.readiness,
    }));
  });
}

/**
 * The Composer toolbar's combined "Tryb pracy" entry (session-composer-design.md §6/§3): work
 * intent (Ask/Plan/Agent), and — only for whichever preset actually has more than one demo
 * operation policy (currently just Agent) — that preset's own operation-approval choice, both in
 * ONE single-choice list instead of two separate pickers (owner audit, round five: see
 * `composerModeItems`'s own doc comment for why). Distinct from the Model/effort picker. Renders
 * nothing without a ready preset — demo catalogue, see `composerOptions.ts`.
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
 * e.g. "Agent · Zatwierdzaj edycje automatycznie": next to `ModelEffortPicker`'s own now-visible
 * "<Model> · <effort>" text, a second full text label genuinely does not fit the row at 375px
 * without wrapping the toolbar onto an extra line or crowding Send off the visible row. Model/
 * effort keeps its text because a real user specifically could not find THAT picker; this one, an
 * icon with `aria-label`/`title` set to the full combined label, has not shown the same problem —
 * a deliberate width-constrained call, not an unexamined default.
 *
 * Same `Menu`/`MenuRadioGroup` single-choice shape — and same `MenuTrigger asChild` requirement
 * that its direct child forward a ref (`IconButton`/`Button` themselves, not an extra wrapping
 * component) — as `ModelEffortPicker`. The compact (icon-only) trigger is a bare `IconButton`
 * directly under `MenuTrigger asChild`, not also wrapped in a `Tooltip`/`TooltipTrigger`
 * (confirmed live, owner audit on a real phone: two nested Radix `asChild` triggers — `MenuTrigger`
 * and `TooltipTrigger`, both cloning onto the same `IconButton` — silently ate the open-on-tap
 * interaction; the same bug existed in `ModelEffortPicker`'s own compact trigger, fixed there
 * too). A `title` attribute gives desktop mouse users the same hover hint `Tooltip` would have,
 * with no composition risk; `aria-label` alone already covers assistive tech.
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
  const items = useMemo(() => composerModeItems(options, t), [options, t]);
  if (items.length === 0) {
    return null;
  }

  const selectedKey = value ? encodeModeKey(value.intent, value.operationPolicyId) : '';
  const selectedItem = items.find((item) => item.key === selectedKey);
  const triggerLabel = selectedItem?.label ?? t('managedSession.intent.placeholder');

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
        <MenuRadioGroup value={selectedKey} onValueChange={(key) => onChange(decodeModeKey(key))}>
          {items.map((item) => (
            <MenuRadioItem
              key={item.key}
              description={item.description}
              disabled={item.readiness === 'unavailable'}
              value={item.key}
            >
              {item.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
