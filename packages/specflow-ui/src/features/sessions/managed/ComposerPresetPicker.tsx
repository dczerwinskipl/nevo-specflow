import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  Button,
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@nevo/ui';
import type { WorkModeOption } from './workModes';

/**
 * The Composer toolbar's "Tryb pracy" entry (session-composer-design.md §6): the provider's own
 * work modes, exactly as its catalogue lists them — in catalogue order, under the catalogue's own
 * titles, unavailable ones disabled with the catalogue's reason (owner decision: the Runtime is
 * the source of truth; this component knows no mode vocabulary). The caller maps its catalogue
 * onto `WorkModeOption`s (`runtimeWorkModes` for a managed Session) and the picked id back onto its
 * own command. Renders nothing when the catalogue offers
 * no modes. Distinct from the Model · effort picker.
 *
 * A text trigger on every layout, with no leading icon (owner audit, round seven: the earlier
 * icon-only compact trigger hid what mode is selected). `compact` only narrows the truncation cap,
 * and `title` carries the full label when it is truncated.
 *
 * Same `Menu`/`MenuRadioGroup` shape — and same `MenuTrigger asChild` requirement that its direct
 * child forward a ref (the `Button` itself, not an extra wrapping component) — as
 * `ModelEffortPicker`. The trigger is not also wrapped in a `Tooltip`/`TooltipTrigger` (confirmed
 * live, owner audit on a real phone: two nested Radix `asChild` triggers silently ate the
 * open-on-tap interaction).
 */
export function ComposerModePicker({
  options,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  options: readonly WorkModeOption[];
  /** The selected mode id; `undefined` shows the placeholder. */
  value: string | undefined;
  onChange: (modeId: string) => void;
  disabled?: boolean;
  /** Narrows the trigger's truncation cap on the narrow/mobile layout; it stays a text trigger. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (options.length === 0) {
    return null;
  }

  const triggerLabel =
    options.find((option) => option.id === value)?.title ?? t('managedSession.intent.placeholder');

  return (
    <Menu>
      <MenuTrigger asChild>
        {/* Inline `maxWidth`, not a `max-w-*` class: `cn` is plain `clsx`, so a class would not
            reliably win over `truncate`'s own `max-w-full` (see `ModelEffortPicker`). */}
        <Button
          style={{ maxWidth: compact ? '9rem' : '14rem' }}
          disabled={disabled}
          id="managed-intent"
          aria-label={t('managedSession.intent.triggerLabel', { value: triggerLabel })}
          labelOverflow="truncate"
          trailingIcon={ChevronDown}
          size="sm"
          title={triggerLabel}
          variant="ghost"
        >
          {triggerLabel}
        </Button>
      </MenuTrigger>
      <MenuContent align="start" aria-label={t('managedSession.intent.label')}>
        <MenuLabel>{t('managedSession.intent.sectionLabel')}</MenuLabel>
        <MenuRadioGroup value={value ?? ''} onValueChange={onChange}>
          {options.map((option) => (
            <MenuRadioItem
              key={option.id}
              value={option.id}
              disabled={option.disabled}
              // Only an unavailable mode gets a second line: the catalogue's reason, else the
              // generic "unavailable" wording. Ready modes have no description — no catalogue
              // provides one, and this component does not invent copy per provider mode.
              description={
                option.disabled
                  ? (option.reason ?? t('managedSession.intent.unavailable'))
                  : undefined
              }
            >
              {option.title}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
