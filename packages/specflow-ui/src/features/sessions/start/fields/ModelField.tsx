import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@nevo/ui';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import type { StartProvider } from '../catalogue/startCatalogue';
import { offersModelChoice } from '../choice/agentChoice';

/**
 * The model titles are the labels; the model id is shown as `meta` only for the titles that repeat,
 * where the title alone cannot tell two models apart.
 */
function modelItems(provider: StartProvider) {
  const counts = new Map<string, number>();
  for (const model of provider.models) {
    counts.set(model.title, (counts.get(model.title) ?? 0) + 1);
  }

  return provider.models.map((model) => ({
    value: model.id,
    textValue: model.title,
    label: model.title,
    meta: (counts.get(model.title) ?? 0) > 1 ? model.id : undefined,
  }));
}

/**
 * The model is a deliberate choice (none preselected). A provider that lists no models has nothing
 * to choose: the field is disabled and says the Session starts at the provider default.
 */
export function ModelField({
  provider,
  value,
  disabled,
  onChange,
  error,
  controlRef,
}: {
  provider: StartProvider;
  value: string;
  disabled: boolean;
  onChange: (modelId: string) => void;
  /** Why the missing model blocks the form (Create, once tried); shown under the field. */
  error?: string;
  /** The picker's control, so the owner can lead focus to it. */
  controlRef?: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();

  return (
    <Field disabled={disabled} invalid={Boolean(error)}>
      <Field.Label>{t('managedSession.model.sectionLabel')}</Field.Label>
      <LocalizedOptionPicker
        value={value}
        disabled={disabled}
        invalid={Boolean(error)}
        controlRef={controlRef}
        placeholder={
          offersModelChoice(provider)
            ? t('managedSession.model.placeholder')
            : t('create.providerDefault')
        }
        onValueChange={onChange}
        items={modelItems(provider)}
      />
      {error && <Field.Error>{error}</Field.Error>}
    </Field>
  );
}
