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
function modelSectionItems(provider: ModelEffortProvider | undefined, withDefaultEffort: boolean) {
  if (!provider?.capabilities.modelOverride || !provider.models.length) {
    return [];
  }

  const withEffort = provider.capabilities.effortOverride;

  return provider.models.map((model) => ({
    modelId: model.modelId,
    label: model.title,
    efforts: withEffort ? model.efforts : [],
    // With an explicit "provider default" row, a single effort is still a real choice (default
    // versus that one effort); without it, 0-1 efforts never show a separate section.
    hasEfforts: withEffort && model.efforts.length > (withDefaultEffort ? 0 : 1),
  }));
}

/**
 * What the picker reads from a provider: only its model list and the two override capabilities.
 * A full `ProviderDescriptor` satisfies it; a start screen can adapt its own provider catalogue
 * (`features/specs/creation/session-start`) without inventing the descriptor's other fields.
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
 * No leading icon (owner audit, round seven: "usuńmy ikonki od modeli i effort. Modele już mamy
 * tekstem"). The visible "<Model> · <effort>" text is what identifies this picker; the earlier
 * `Bot` glyph only added width the narrow toolbar needs for the work-mode picker's own text label.
 *
 * Owner audit, round two — reference screenshots of ChatGPT/Codex's own compact composer toolbar:
 * its model+effort trigger always shows a short but readable TEXT label next to the icon (e.g.
 * "6.1 Sol  Średni"), never collapses to an unlabeled icon. `compact` below no longer renders a
 * bare `IconButton` for exactly that reason — an icon-only trigger is very likely why the owner
 * could not find this picker at all on the narrow layout.
 *
 * Owner audit, round three — a real caution on the above: this app's own `ProviderDescriptor`
 * (`model.title`, checked directly — there is no separate short/display-name field, only the one
 * `title` string) is not guaranteed to be a short brand-dropped form the way the reference
 * screenshots' own in-app labels were ("Claude Sonnet 5", not "Sonnet 5"; "ChatGPT 6.1 Sol", not
 * "6.1 Sol" — this product cannot assume the brand prefix is implicit the way a provider's own
 * app can).
 *
 * Owner audit, round four — Google's Antigravity app proves the full name fits cleanly without
 * truncation in the common case: its own composer trigger shows "Claude Opus 5.5" in a heavier
 * weight next to "High" in a lighter/secondary weight, both at a small label size, plus a small
 * expand chevron. The trigger below copies that exact anatomy instead of one plain joined string:
 * the model title keeps the `Button` label's own default weight (`label-sm`'s `600`, already the
 * smallest/boldest label size this Design System has), the effort renders in a second, explicitly
 * lighter-weight/secondary-colored span right after it, and a trailing `ChevronDown` reads as
 * "this expands" the way the reference's own chevron does. `labelOverflow="truncate"` still caps
 * the whole thing to the trigger's `max-w` as a last-resort fallback — only a genuinely unusual,
 * very long name should ever actually hit it (see `CompactTriggerLongModelName` for that specific
 * live proof; every other story's realistic-length name fits untruncated).
 *
 * Owner audit, round five — the popover itself now mirrors that same Antigravity reference
 * directly: two sections ("Model", then "Reasoning effort") in ONE popover instead of a single
 * flattened list of "Title · effort" rows. Picking a model that has more than one effort keeps the
 * popover open (its own `MenuRadioItem`'s `onSelect` calls `event.preventDefault()` — the
 * documented Radix mechanism for suppressing a `DropdownMenu` item's own default close-on-select)
 * so the effort section can be refined in the same open menu; picking a model with 0-1 efforts, or
 * picking the effort itself, closes normally. Every model pick still fires a complete `onChange`
 * immediately (keeping the previously selected effort when the new model still offers it, else
 * falling back to that model's first effort) — the popover staying open is purely to let the user
 * *refine* that default, never to withhold a value until a second click. Per-row "available
 * efforts" descriptions are gone: once effort is its own visible section, repeating it as a second
 * line on every model row said nothing new.
 */
export function ModelEffortPicker({
  provider,
  value,
  onChange,
  disabled = false,
  compact = false,
  defaultEffortLabel,
}: {
  provider: ModelEffortProvider | undefined;
  value: ModelEffortValue | undefined;
  onChange: (modelId: string, effort?: string) => void;
  disabled?: boolean;
  /**
   * Start-of-Session variant (`features/specs/creation/session-start`): "no effort" is an explicit,
   * selectable choice labelled with this text (the provider's own default), shown as the first row
   * of the effort section. Picking a model then keeps the current effort only when the new model
   * offers it and otherwise falls back to that default (`undefined`), instead of pre-selecting the
   * model's first effort. Omitted in the Session's own Composer, whose next Turn always has an
   * effort.
   */
  defaultEffortLabel?: string;
  /**
   * Narrows the trigger's max width for a layout with less room (`ManagedSession.tsx` passes
   * `!supportsSplit`, the same measured-width signal it already uses for the Context header
   * action) — it still always shows the selected model (and effort) as visible text, never
   * collapsing to an icon-only trigger (owner audit, round two: see this component's
   * own doc comment for why an unlabeled icon is specifically what made the owner unable to find
   * this picker at all). The width is generous enough that a realistic model name fits
   * untruncated (owner audit, round four): it only narrows the gap between the two triggers'
   * typical content, not the point past which truncation kicks in.
   */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const withDefaultEffort = defaultEffortLabel !== undefined;
  const modelItems = useMemo(
    () => modelSectionItems(provider, withDefaultEffort),
    [provider, withDefaultEffort],
  );
  if (modelItems.length === 0) {
    return null;
  }

  const selectedModel = modelItems.find((item) => item.modelId === value?.modelId);
  const triggerLabel = selectedModel
    ? value?.effort
      ? `${selectedModel.label} · ${value.effort}`
      : selectedModel.label
    : t('managedSession.model.placeholder');
  const showEffortSection = selectedModel?.hasEfforts ?? false;

  return (
    <Menu>
      <MenuTrigger asChild>
        {/* A `Button` either way — never a bare icon-only `IconButton` (owner audit, round two:
            see this component's own doc comment). Title + effort render as two spans, not one
            joined string, so the effort can carry its own lighter weight/secondary color
            (Antigravity reference, owner audit round four) while the title keeps the label's own
            bold `label-sm` weight; `labelOverflow="truncate"` on the whole thing is still the
            fallback for a genuinely long name (see `CompactTriggerLongModelName`).
            The cap is an inline `style.maxWidth`, not a `max-w-*` className (confirmed live,
            round four's own long-name check: `cn` here is plain `clsx`, not `tailwind-merge`, so
            a `max-w-*` utility class has no guaranteed precedence over `truncate`'s own built-in
            `max-w-full` — the two co-existing classes left `max-w-full` winning in the generated
            stylesheet's own rule order, and the "long name" story rendered at its full,
            untruncated width instead of actually being capped). An inline style unconditionally
            outranks any class, so the cap is guaranteed regardless of utility declaration order. */}
        <Button
          style={{ maxWidth: compact ? '12rem' : '18rem' }}
          disabled={disabled}
          id="managed-model"
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
                    : withDefaultEffort
                      ? undefined
                      : item.efforts[0]
                  : undefined;
                onChange(item.modelId, nextEffort);
                if (item.hasEfforts) {
                  // Keep the popover open so the just-revealed "Reasoning effort" section below
                  // can be refined without reopening the menu (owner audit, round five).
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
              {withDefaultEffort ? (
                <MenuRadioItem value="" onSelect={() => onChange(selectedModel.modelId)}>
                  {defaultEffortLabel}
                </MenuRadioItem>
              ) : null}
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
