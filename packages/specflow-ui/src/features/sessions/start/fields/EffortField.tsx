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
}: {
  efforts: readonly string[];
  value: string;
  disabled: boolean;
  onChange: (effort: string) => void;
}) {
  const { t } = useTranslation();
  const off = disabled || efforts.length === 0;
  const items = [providerDefaultEffort, ...efforts].map((effort) => {
    const label =
      effort === providerDefaultEffort ? t('sessionStart.fields.effortDefault') : effort;

    return { value: effort, textValue: label, label };
  });

  return (
    <Field disabled={off}>
      <Field.Label>{t('sessionStart.fields.effort')}</Field.Label>
      <LocalizedOptionPicker value={value} disabled={off} onValueChange={onChange} items={items} />
    </Field>
  );
}
