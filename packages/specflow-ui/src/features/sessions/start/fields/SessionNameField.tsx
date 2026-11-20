import { useTranslation } from 'react-i18next';
import { Field, TextInput } from '@nevo/ui';
import {
  sessionNameFrom,
  sessionNameMaxLength,
  type SessionNameChoice,
} from '../choice/sessionName';

/**
 * The Session's own name, optional: left empty, the agent names the Session from the first message
 * (the note next to Start says so). The remaining characters show only near the limit.
 */
export function SessionNameField({
  choice,
  locked,
  onChange,
}: {
  choice: SessionNameChoice;
  locked: boolean;
  onChange: (choice: SessionNameChoice) => void;
}) {
  const { t } = useTranslation();
  const remaining = sessionNameMaxLength - choice.value.length;

  return (
    <Field disabled={locked}>
      <Field.Label>
        {t('sessionStart.name.label')}{' '}
        <span className="font-normal text-content-muted">({t('sessionStart.name.optional')})</span>
      </Field.Label>
      <TextInput
        value={choice.value}
        maxLength={sessionNameMaxLength}
        disabled={locked}
        placeholder={t('sessionStart.name.placeholder')}
        onChange={(event) => onChange(sessionNameFrom(event.target.value))}
      />
      {remaining <= 32 && (
        <Field.Description>{t('sessionStart.name.remaining', { remaining })}</Field.Description>
      )}
    </Field>
  );
}
