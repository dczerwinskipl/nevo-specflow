import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@nevo/ui';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import { providerDefaultEffort } from '../choice/agentChoice';

/**
 * **Default** (the provider's own) followed by the model's efforts. A picker, not a segmented
 * control: the provider decides how many efforts there are (up to sixteen). A model without
 * efforts leaves it disabled at **Default**.
 */
export function EffortField({
  efforts,
  value,
  disabled,
  onChange,
  error,
  controlRef,
}: {
  efforts: readonly string[];
  value: string;
  disabled: boolean;
  onChange: (effort: string) => void;
  /** Why the effort blocks the owner's form (Create, once tried); shown under the field. */
  error?: string;
  /** The picker's control, so the owner can lead focus to it. */
  controlRef?: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const off = disabled || efforts.length === 0;
  const items = [providerDefaultEffort, ...efforts].map((effort) => {
    const label =
      effort === providerDefaultEffort ? t('sessionStart.fields.effortDefault') : effort;

    return { value: effort, textValue: label, label };
  });

  return (
    <Field disabled={off} invalid={Boolean(error)}>
      <Field.Label>{t('sessionStart.fields.effort')}</Field.Label>
      <LocalizedOptionPicker
        value={value}
        disabled={off}
        invalid={Boolean(error)}
        controlRef={controlRef}
        onValueChange={onChange}
        items={items}
      />
      {error && <Field.Error>{error}</Field.Error>}
    </Field>
  );
}
