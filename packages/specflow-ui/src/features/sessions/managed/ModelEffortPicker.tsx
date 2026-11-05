import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  Button,
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@nevo/ui';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';

/**
 * Flattens the matched provider's models into the picker's "Model" section rows. Honors the
 * catalogue's own modelOverride/effortOverride capability flags rather than assuming every listed
 * model is overridable. Each model is its own row (not one row per model+effort pair, see this
 * file's own doc comment) — `hasEfforts` says whether picking it should reveal the "Reasoning
 * effort" section below, exactly mirroring the single-effort/no-effort collapse this file always
 * had (a model with 0-1 efforts never shows a separate effort choice at all).
 */
function modelSectionItems(provider: ModelEffortProvider | undefined) {
  if (!provider?.capabilities.modelOverride || !provider.models.length) {
    return [];
  }

  const withEffort = provider.capabilities.effortOverride;

  return provider.models.map((model) => ({
    modelId: model.modelId,
    label: model.title,
    efforts: withEffort ? model.efforts : [],
    hasEfforts: withEffort && model.efforts.length > 1,
  }));
}

/**
 * What the picker reads from a provider: only its model list and the two override capabilities.
 * A full `ProviderDescriptor` satisfies it; the pending Session of a start
 * (`start/handoff/StartedSessionPlaceholder`) builds one from its start values alone, without
 * inventing the descriptor's other fields.
 */
export interface ModelEffortProvider {
  capabilities: Pick<ProviderDescriptor['capabilities'], 'modelOverride' | 'effortOverride'>;
  models: ProviderDescriptor['models'];
}

/** The currently selected model (and, when the provider supports it, effort) for the next Turn. */
export interface ModelEffortValue {
  modelId: string;
  effort?: string;
}

/**
 * The composer's "Model · Effort" picker (session-chat-v10 §"Model — następny Turn"), extracted
 * out of `ManagedSession.tsx` as its own self-contained unit: a clean `value`/`onChange` pair plus
 * the `provider` descriptor that decides what to offer, so it can be mounted (and story-tested) on
 * its own, without the rest of the screen.
 *
 * Renders nothing when `provider` has no models, or has not opted into `capabilities.modelOverride`
 * — the gating is entirely internal, so a caller never has to duplicate "should I render this?"
 * logic alongside it.
 *
 * No leading icon: the visible "<Model> · <effort>" text is what identifies this picker, and an
 * icon would only add width the narrow toolbar needs for the work-mode picker's own text label.
 *
 * The trigger always shows a short but readable TEXT label, never collapsing to an unlabeled icon
 * (`compact` does not render a bare `IconButton`): an icon-only trigger makes the picker hard to
 * find on the narrow layout.
 *
 * `ProviderDescriptor` has no separate short/display-name field, only the one `model.title`
 * string, which is not guaranteed to be a short brand-dropped form ("Claude Sonnet 5", not
 * "Sonnet 5"); this product cannot assume the brand prefix is implicit the way a provider's own
 * app can.
 *
 * The full name fits without truncation in the common case, so the trigger shows the model title
 * in a heavier weight next to the effort in a lighter/secondary weight, both at a small label
 * size, plus a small expand chevron, instead of one plain joined string:
 * the model title keeps the `Button` label's own default weight (`label-sm`'s `600`, already the
 * smallest/boldest label size this Design System has), the effort renders in a second, explicitly
 * lighter-weight/secondary-colored span right after it, and a trailing `ChevronDown` reads as
 * "this expands" the way a chevron conventionally does. `labelOverflow="truncate"` still caps
 * the whole thing to the trigger's `max-w` as a last-resort fallback — only a genuinely unusual,
 * very long name should ever actually hit it (see `CompactTriggerLongModelName` for that specific
 * case; every other story's realistic-length name fits untruncated).
 *
 * The popover has two sections ("Model", then "Reasoning effort") in ONE popover instead of a
 * single flattened list of "Title · effort" rows. Picking a model that has more than one effort keeps the
 * popover open (its own `MenuRadioItem`'s `onSelect` calls `event.preventDefault()` — the
 * documented Radix mechanism for suppressing a `DropdownMenu` item's own default close-on-select)
 * so the effort section can be refined in the same open menu; picking a model with 0-1 efforts, or
 * picking the effort itself, closes normally. Every model pick still fires a complete `onChange`
 * immediately (keeping the previously selected effort when the new model still offers it, else
 * falling back to that model's first effort) — the popover staying open is purely to let the user
 * *refine* that default, never to withhold a value until a second click. Model rows carry no
 * "available efforts" description: with effort as its own visible section, repeating it as a
 * second line on every model row would say nothing new.
 */
export function ModelEffortPicker({
  provider,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  provider: ModelEffortProvider | undefined;
  value: ModelEffortValue | undefined;
  onChange: (modelId: string, effort?: string) => void;
  disabled?: boolean;
  /**
   * Narrows the trigger's max width for a layout with less room (`ManagedSession.tsx` passes
   * `!supportsSplit`, the same measured-width signal it already uses for the Context header
   * action) — it still always shows the selected model (and effort) as visible text, never
   * collapsing to an icon-only trigger (see this component's own doc comment). The
   * width is generous enough that a realistic model name fits untruncated: it only narrows the gap between the two triggers'
   * typical content, not the point past which truncation kicks in.
   */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const modelItems = useMemo(() => modelSectionItems(provider), [provider]);
  if (modelItems.length === 0) {
    return null;
  }

  const selectedModel = modelItems.find((item) => item.modelId === value?.modelId);
  const triggerLabel = selectedModel
    ? value?.effort
      ? `${selectedModel.label} · ${value.effort}`
      : selectedModel.label
    : // A session model the catalogue no longer lists is still shown (its raw id), and a session
      // with none chosen runs the provider's default: neither is a "select a model" prompt.
      (value?.modelId ?? t('managedSession.model.default'));
  const showEffortSection = selectedModel?.hasEfforts ?? false;

  return (
    <Menu>
      <MenuTrigger asChild>
        {/* A `Button` either way — never a bare icon-only `IconButton` (see this component's own doc
            comment). Title + effort render as two spans, not one
            joined string, so the effort can carry its own lighter weight/secondary color
            while the title keeps the label's own
            bold `label-sm` weight; `labelOverflow="truncate"` on the whole thing is still the
            fallback for a genuinely long name (see `CompactTriggerLongModelName`).
            The cap is an inline `style.maxWidth`, not a `max-w-*` className (`cn` here is plain `clsx`, not `tailwind-merge`, so
            a `max-w-*` utility class has no guaranteed precedence over `truncate`'s own built-in
            `max-w-full` — the two co-existing classes left `max-w-full` winning in the generated
            stylesheet's own rule order, and the "long name" story rendered at its full,
            untruncated width instead of actually being capped). An inline style unconditionally
            outranks any class, so the cap is guaranteed regardless of utility declaration order. */}
        <Button
          style={{ maxWidth: compact ? '12rem' : '18rem' }}
          disabled={disabled}
          id="managed-model"
          aria-label={t('managedSession.model.triggerLabel', { value: triggerLabel })}
          labelOverflow="truncate"
          trailingIcon={ChevronDown}
          size="sm"
          title={triggerLabel}
          variant="ghost"
        >
          {selectedModel ? (
            <>
              {selectedModel.label}
              {value?.effort ? (
                // `font-normal` only, deliberately no explicit color override (confirmed live:
                // `text-content-secondary` (#c5c7cc) actually computes LIGHTER/brighter than this
                // ghost `Button`'s own idle `text-content-muted` (#8f929a) in this theme, so it
                // made the effort read as MORE prominent than the model title instead of less —
                // the opposite of "lighter/secondary weight"). Inheriting `text-current` keeps the
                // same color as the title; the lighter `font-normal` weight next to the title's
                // bold `label-sm` (600) is what actually reads as de-emphasized here.
                // The separating space sits outside the span: accessible-name computation trims
                // each element's own text, so a leading space inside it read as "Model· high".
                <>
                  {' '}
                  <span className="font-normal">· {value.effort}</span>
                </>
              ) : null}
            </>
          ) : (
            triggerLabel
          )}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" aria-label={t('managedSession.model.label')}>
        <MenuLabel>{t('managedSession.model.sectionLabel')}</MenuLabel>
        {/* `onValueChange` deliberately omitted (optional on `MenuRadioGroup`): real selection
            happens in each item's own `onSelect` below, which also decides whether to keep the
            menu open — `onValueChange` alone cannot `preventDefault()` the close Radix already
            started by the time it fires. */}
        <MenuRadioGroup value={selectedModel?.modelId ?? ''}>
          {modelItems.map((item) => (
            <MenuRadioItem
              key={item.modelId}
              value={item.modelId}
              onSelect={(event) => {
                const nextEffort = item.hasEfforts
                  ? value?.effort && item.efforts.includes(value.effort)
                    ? value.effort
                    : item.efforts[0]
                  : undefined;
                onChange(item.modelId, nextEffort);
                if (item.hasEfforts) {
                  // Keep the popover open so the just-revealed "Reasoning effort" section below
                  // can be refined without reopening the menu.
                  event.preventDefault();
                }
              }}
            >
              {item.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        {showEffortSection && selectedModel ? (
          <>
            <MenuSeparator />
            <MenuLabel>{t('managedSession.model.effortSectionLabel')}</MenuLabel>
            <MenuRadioGroup value={value?.effort ?? ''}>
              {selectedModel.efforts.map((effort) => (
                <MenuRadioItem
                  key={effort}
                  value={effort}
                  onSelect={() => onChange(selectedModel.modelId, effort)}
                >
                  {effort}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
