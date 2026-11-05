import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, SegmentedControl } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import type { StartMode } from '../catalogue/startCatalogue';

/** A segmented control only for a small, fixed set; a longer list is a picker (new-session-ui-spec.md section 6). */
const segmentedMax = 4;

/**
 * The provider catalogue's own work modes under its own titles, usable ones only: an unavailable
 * mode is omitted, not shown disabled (session-composer-design.md §7 item 4). A provider with no
 * usable mode is itself unavailable, with the reason on the provider.
 */
export function WorkModeField({
  modes: catalogueModes,
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
  const modes = catalogueModes.filter((mode) => mode.available);

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
          }))}
        />
      </Field>
    );
  }

  return (
    <Field controlId={controlId} disabled={disabled}>
      <Field.Label>{t('managedSession.intent.sectionLabel')}</Field.Label>
      <SegmentedControl
        aria-labelledby={`${controlId}-label`}
        className="w-full"
        value={value}
        onValueChange={onChange}
      >
        {modes.map((mode) => (
          <SegmentedControl.Item key={mode.id} value={mode.id} disabled={disabled}>
            {text(mode.title)}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
    </Field>
  );
}
