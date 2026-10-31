import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Bot, ChevronDown } from 'lucide-react';
import { Button, Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@nevo/ui';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';

/** Opaque Select value encoding a model+effort pair; modelId/effort are not guaranteed separator-safe. */
function encodeModelKey(modelId: string, effort?: string) {
  return JSON.stringify(effort ? [modelId, effort] : [modelId]);
}

function decodeModelKey(key: string): { modelId: string; effort?: string } {
  const [modelId, effort] = JSON.parse(key) as [string, string?];

  return effort ? { modelId, effort } : { modelId };
}

/**
 * Flattens the matched provider's models/efforts into one "Model · Effort" picker, per the
 * composer design's single combined selector. Honors the catalogue's own modelOverride/
 * effortOverride capability flags rather than assuming every listed model is overridable.
 *
 * Each item also carries an optional `description` — the model's full set of available efforts
 * (the Menu picker's own second line, matching the accepted mockup's richer item presentation,
 * session-chat-v10 §"Model — następny Turn"), omitted for a model with a single effort (or none),
 * where it would not add anything the label does not already say.
 */
function modelPickerItems(provider: ProviderDescriptor | undefined, t: TFunction) {
  if (!provider?.capabilities.modelOverride || !provider.models.length) {
    return [];
  }

  const withEffort = provider.capabilities.effortOverride;

  return provider.models.flatMap((model) => {
    const description =
      withEffort && model.efforts.length > 1
        ? t('managedSession.model.availableEfforts', { list: model.efforts.join(', ') })
        : undefined;

    return withEffort && model.efforts.length
      ? model.efforts.map((effort) => ({
          key: encodeModelKey(model.modelId, effort),
          label: model.title + ' · ' + effort,
          description,
        }))
      : [{ key: encodeModelKey(model.modelId), label: model.title, description: undefined }];
  });
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
 * Icon: `Bot`, not `SlidersHorizontal` (owner audit, live: a real user could not find this picker
 * at all, and instead assumed the composer toolbar's work-mode/intent entry — which used to carry
 * `Bot` — was "where you pick the model"; see `ComposerPresetPicker.tsx`'s own doc comment for the
 * other half of that swap). `Bot` is the one glyph a real user already associates with "the
 * model", so giving it to the picker that actually *is* the model/effort picker removes the
 * ambiguity instead of relying on a neutral icon no one reliably reads as "AI model" at a glance.
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
 */
export function ModelEffortPicker({
  provider,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  provider: ProviderDescriptor | undefined;
  value: ModelEffortValue | undefined;
  onChange: (modelId: string, effort?: string) => void;
  disabled?: boolean;
  /**
   * Narrows the trigger's max width for a layout with less room (`ManagedSession.tsx` passes
   * `!supportsSplit`, the same measured-width signal it already uses for the Context header
   * action) — it still always shows the selected model (and effort) as visible text next to the
   * icon, never collapsing to an icon-only trigger (owner audit, round two: see this component's
   * own doc comment for why an unlabeled icon is specifically what made the owner unable to find
   * this picker at all). The width is generous enough that a realistic model name fits
   * untruncated (owner audit, round four): it only narrows the gap between the two triggers'
   * typical content, not the point past which truncation kicks in.
   */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const modelItems = useMemo(() => modelPickerItems(provider, t), [provider, t]);
  if (modelItems.length === 0) {
    return null;
  }

  // Always a defined string so MenuRadioGroup stays controlled from its first render (never
  // undefined), even before the Session's current model/effort is known.
  const selectedModelKey = value ? encodeModelKey(value.modelId, value.effort) : '';
  const selectedModelLabel = modelItems.find((item) => item.key === selectedModelKey)?.label;
  const triggerLabel = selectedModelLabel ?? t('managedSession.model.placeholder');
  // The model actually selected right now, kept separate from `triggerLabel`'s joined
  // "Title · effort" string (still used for `title`/the placeholder fallback) so the trigger can
  // render the title and effort as two differently-weighted spans (owner audit, round four) —
  // read straight off `value`/`provider`, not reparsed out of the joined display string.
  const selectedModel = value
    ? provider?.models.find((model) => model.modelId === value.modelId)
    : undefined;

  return (
    <Menu>
      {/* The Design System's `Select` has no compact size variant (hardcoded to
          `h-control-height-default`) and no per-option description, so it cannot show the richer
          "title + available efforts" presentation the accepted mockup calls for (session-chat-v10
          §"Model — następny Turn"). `Menu` + `MenuRadioItem` (the same checkmark single-choice
          primitive `LocaleMenu` already uses) does, via its `description` prop (shared
          `Select`/`Combobox` option anatomy, see Menu.tsx). */}
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
          leadingIcon={Bot}
          trailingIcon={ChevronDown}
          size="sm"
          title={triggerLabel}
          variant="ghost"
        >
          {selectedModel ? (
            <>
              {selectedModel.title}
              {value?.effort ? (
                // `font-normal` only, deliberately no explicit color override (confirmed live:
                // `text-content-secondary` (#c5c7cc) actually computes LIGHTER/brighter than this
                // ghost `Button`'s own idle `text-content-muted` (#8f929a) in this theme, so it
                // made the effort read as MORE prominent than the model title instead of less —
                // the opposite of "lighter/secondary weight"). Inheriting `text-current` keeps the
                // same color as the title; the lighter `font-normal` weight next to the title's
                // bold `label-sm` (600) is what actually reads as de-emphasized here.
                <span className="font-normal"> · {value.effort}</span>
              ) : null}
            </>
          ) : (
            triggerLabel
          )}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" aria-label={t('managedSession.model.label')}>
        <MenuRadioGroup
          value={selectedModelKey}
          onValueChange={(key) => {
            const next = decodeModelKey(key);
            onChange(next.modelId, next.effort);
          }}
        >
          {modelItems.map((item) => (
            <MenuRadioItem key={item.key} description={item.description} value={item.key}>
              {item.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
