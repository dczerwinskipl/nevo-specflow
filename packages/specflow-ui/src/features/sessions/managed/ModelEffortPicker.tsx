import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import {
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nevo/ui';
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
   * Collapses the trigger to an icon-only `IconButton` (no visible "Model · effort" text), for a
   * layout with no room for it. `ManagedSession.tsx` passes `!supportsSplit` (the same
   * measured-width signal it already uses for the Context header action) — on the narrow/mobile
   * layout there is no room for the text, so the trigger collapses to just the icon; split-capable
   * (wide) layouts keep showing the selected value as visible text next to the icon.
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

  return (
    <Menu>
      {/* The Design System's `Select` has no compact size variant (hardcoded to
          `h-control-height-default`) and no per-option description, so it cannot show the richer
          "title + available efforts" presentation the accepted mockup calls for (session-chat-v10
          §"Model — następny Turn"). `Menu` + `MenuRadioItem` (the same checkmark single-choice
          primitive `LocaleMenu` already uses) does, via its `description` prop (shared
          `Select`/`Combobox` option anatomy, see Menu.tsx). */}
      <MenuTrigger asChild>
        {compact ? (
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label={triggerLabel}
                  disabled={disabled}
                  icon={SlidersHorizontal}
                  id="managed-model"
                  size="sm"
                  variant="ghost"
                />
              </TooltipTrigger>
              <TooltipContent>{triggerLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            className="max-w-56 sm:max-w-72"
            disabled={disabled}
            id="managed-model"
            labelOverflow="truncate"
            leadingIcon={SlidersHorizontal}
            size="sm"
            variant="ghost"
          >
            {triggerLabel}
          </Button>
        )}
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
