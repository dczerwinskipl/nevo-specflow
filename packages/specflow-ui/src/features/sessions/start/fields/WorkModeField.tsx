import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, SegmentedControl } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import type { StartMode } from '../catalogue/startCatalogue';

/** A segmented control only for a small, fixed set; a longer list is a picker (new-session-ui-spec.md section 6). */
const segmentedMax = 4;

/**
 * The provider catalogue's own work modes under its own titles. An unavailable mode is listed but
 * disabled, and says why.
 */
export function WorkModeField({
  modes,
  value,
  disabled,
  onChange,
}: {
  modes: readonly StartMode[];
  value: string;
  disabled: boolean;
  onChange: (mode: string) => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const controlId = useId();
  const reasonOf = (mode: StartMode) => mode.reason ?? t('managedSession.intent.unavailable');

  if (modes.length > segmentedMax) {
    return (
      <Field disabled={disabled}>
        <Field.Label>{t('managedSession.intent.sectionLabel')}</Field.Label>
        <LocalizedOptionPicker
          value={value}
          disabled={disabled}
          placeholder={t('managedSession.intent.placeholder')}
          onValueChange={onChange}
          items={modes.map((mode) => ({
            value: mode.id,
            textValue: text(mode.title),
            label: text(mode.title),
            unavailable: !mode.available,
            description: mode.available ? undefined : reasonOf(mode),
          }))}
        />
      </Field>
    );
  }

  const reasons = modes
    .filter((mode) => !mode.available)
    .map((mode) => `${text(mode.title)}: ${reasonOf(mode)}`);

  return (
    <Field controlId={controlId} disabled={disabled}>
      <Field.Label>{t('managedSession.intent.sectionLabel')}</Field.Label>
      <SegmentedControl
        aria-labelledby={`${controlId}-label`}
        aria-describedby={reasons.length > 0 ? `${controlId}-description` : undefined}
        className="w-full"
        value={value}
        onValueChange={onChange}
      >
        {modes.map((mode) => (
          <SegmentedControl.Item
            key={mode.id}
            value={mode.id}
            disabled={disabled || !mode.available}
          >
            {text(mode.title)}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
      {reasons.length > 0 && <Field.Description>{reasons.join(' · ')}</Field.Description>}
    </Field>
  );
}
