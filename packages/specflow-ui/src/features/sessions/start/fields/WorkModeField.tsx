import { useId, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, SegmentedControl } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import type { StartMode } from '../catalogue/startCatalogue';

/** A segmented control only for a small, fixed set; a longer list is a picker (full-session.md
 * "Starting a Session"). */
const segmentedMax = 4;

/**
 * The provider catalogue's own work modes under its own titles, usable ones only: an unavailable
 * mode is omitted, not shown disabled (full-session.md "Composer"). A provider with no
 * usable mode is itself unavailable, with the reason on the provider.
 */
export function WorkModeField({
  modes: catalogueModes,
  value,
  disabled,
  onChange,
  error,
  controlRef,
}: {
  modes: readonly StartMode[];
  value: string;
  disabled: boolean;
  onChange: (mode: string) => void;
  /** Why the work mode blocks the owner's form (Create, once tried); shown under the field. */
  error?: string;
  /** The control (the picker, or the segmented group), so the owner can lead focus to it. */
  controlRef?: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const controlId = useId();
  const modes = catalogueModes.filter((mode) => mode.available);

  if (modes.length > segmentedMax) {
    return (
      <Field disabled={disabled} invalid={Boolean(error)}>
        <Field.Label>{t('managedSession.intent.sectionLabel')}</Field.Label>
        <LocalizedOptionPicker
          value={value}
          disabled={disabled}
          invalid={Boolean(error)}
          controlRef={controlRef}
          placeholder={t('managedSession.intent.placeholder')}
          onValueChange={onChange}
          items={modes.map((mode) => ({
            value: mode.id,
            textValue: text(mode.title),
            label: text(mode.title),
          }))}
        />
        {error && <Field.Error>{error}</Field.Error>}
      </Field>
    );
  }

  return (
    <Field controlId={controlId} disabled={disabled} invalid={Boolean(error)}>
      <Field.Label>{t('managedSession.intent.sectionLabel')}</Field.Label>
      <SegmentedControl
        ref={(element) => {
          if (controlRef) {
            controlRef.current = element;
          }
        }}
        aria-labelledby={`${controlId}-label`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${controlId}-error` : undefined}
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
      {error && <Field.Error>{error}</Field.Error>}
    </Field>
  );
}
