import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Bot, ShieldCheck } from 'lucide-react';
import {
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@nevo/ui';
import type {
  ComposerIntent,
  ComposerOperationPolicy,
  ComposerOperationPolicyId,
  ComposerPreset,
} from './composerOptions';

/**
 * The Composer toolbar's "Tryb pracy" entry (session-composer-design.md §6/§3: work intent is a
 * presentation choice, distinct from operation approval below and from the Model/effort picker).
 * Same `Menu`/`MenuRadioGroup` single-choice shape — and same `MenuTrigger asChild` requirement
 * that its direct child forward a ref (`IconButton`/`Button` themselves, not an extra wrapping
 * component) — as `ModelEffortPicker`. Renders nothing without a ready preset — demo catalogue,
 * see `composerOptions.ts`.
 *
 * The compact (icon-only) trigger is a bare `IconButton` directly under `MenuTrigger asChild`, not
 * also wrapped in a `Tooltip`/`TooltipTrigger` (confirmed live, owner audit on a real phone: two
 * nested Radix `asChild` triggers — `MenuTrigger` and `TooltipTrigger`, both cloning onto the same
 * `IconButton` — silently ate the open-on-tap interaction; the same bug existed in
 * `ModelEffortPicker`'s own compact trigger, fixed there too). A `title` attribute gives desktop
 * mouse users the same hover hint `Tooltip` would have, with no composition risk; `aria-label`
 * alone already covers assistive tech.
 */
export function ComposerIntentPicker({
  presets,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  presets: readonly ComposerPreset[];
  value: ComposerIntent | undefined;
  onChange: (intent: ComposerIntent) => void;
  disabled?: boolean;
  /** Same convention as `ModelEffortPicker`'s own `compact`: collapses to an icon-only trigger on
   * the narrow/mobile layout. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (presets.length === 0) {
    return null;
  }

  const selected = presets.find((preset) => preset.intent === value);
  const triggerLabel = selected
    ? t(`managedSession.intent.preset.${selected.intent}`)
    : t('managedSession.intent.placeholder');

  return (
    <Menu>
      <MenuTrigger asChild>
        {compact ? (
          <IconButton
            aria-label={triggerLabel}
            disabled={disabled}
            icon={Bot}
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
            leadingIcon={Bot}
            size="sm"
            variant="ghost"
          >
            {triggerLabel}
          </Button>
        )}
      </MenuTrigger>
      <MenuContent align="start" aria-label={t('managedSession.intent.label')}>
        <MenuRadioGroup
          value={value ?? ''}
          onValueChange={(intent) => onChange(intent as ComposerIntent)}
        >
          {presets.map((preset) => (
            <MenuRadioItem
              key={preset.intent}
              disabled={preset.readiness === 'unavailable'}
              value={preset.intent}
            >
              {t(`managedSession.intent.preset.${preset.intent}`)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/**
 * `policy.id`'s description key, per literal case rather than a `${id}Description` template:
 * unlike `preset.intent`/`policy.id` used bare above, the template union here would have to
 * include every id's `...Description` key regardless of `hasDescription`, including
 * `askEachTimeDescription`, which does not exist — an explicit switch only ever names a key that
 * is actually declared in the locale files.
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
 * The Composer toolbar's conditional "Zgody na operacje" entry (session-composer-design.md §6,
 * §7 item 2: a provider with only one policy should probably not show this as a separate
 * selector). Renders nothing unless the active preset has more than one demo policy — never a
 * single-option or disabled picker standing in for "no real choice". Compact trigger: see
 * `ComposerIntentPicker`'s own doc comment for why it is a bare `IconButton`, not also wrapped in
 * a `Tooltip`.
 */
export function ComposerOperationPolicyPicker({
  policies,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  policies: readonly ComposerOperationPolicy[];
  value: ComposerOperationPolicyId | undefined;
  onChange: (policyId: ComposerOperationPolicyId) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (policies.length < 2) {
    return null;
  }

  const selected = policies.find((policy) => policy.id === value);
  const triggerLabel = selected
    ? t(`managedSession.policy.option.${selected.id}`)
    : t('managedSession.policy.placeholder');

  return (
    <Menu>
      <MenuTrigger asChild>
        {compact ? (
          <IconButton
            aria-label={triggerLabel}
            disabled={disabled}
            icon={ShieldCheck}
            id="managed-policy"
            size="sm"
            title={triggerLabel}
            variant="ghost"
          />
        ) : (
          <Button
            className="max-w-40 sm:max-w-56"
            disabled={disabled}
            id="managed-policy"
            labelOverflow="truncate"
            leadingIcon={ShieldCheck}
            size="sm"
            variant="ghost"
          >
            {triggerLabel}
          </Button>
        )}
      </MenuTrigger>
      <MenuContent align="start" aria-label={t('managedSession.policy.label')}>
        <MenuRadioGroup
          value={value ?? ''}
          onValueChange={(id) => onChange(id as ComposerOperationPolicyId)}
        >
          {policies.map((policy) => (
            <MenuRadioItem
              key={policy.id}
              description={policy.hasDescription ? policyDescription(policy.id, t) : undefined}
              value={policy.id}
            >
              {t(`managedSession.policy.option.${policy.id}`)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
