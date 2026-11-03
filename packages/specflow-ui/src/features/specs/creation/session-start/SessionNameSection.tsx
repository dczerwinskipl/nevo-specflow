import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, TextInput, Typography } from '@nevo/ui';
import { sessionNameMaxLength, type SessionNameChoice } from './sessionName';

/**
 * The Session's name: by default the agent names it from the first message (said in one line, no
 * field), with "Give it your own name" as the explicit alternative that reveals the name field.
 * Switching back keeps the typed text for a later switch, but the agent names the Session.
 */
export function SessionNameSection({
  choice,
  locked,
  onChange,
}: {
  choice: SessionNameChoice;
  locked: boolean;
  onChange: (choice: SessionNameChoice) => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);
  const custom = choice.mode === 'custom';
  const remaining = sessionNameMaxLength - choice.value.length;

  return (
    <section className="grid gap-3" aria-labelledby={headingId}>
      <Typography as="h2" variant="title-md" id={headingId}>
        {t('sessionStart.name.heading')}
      </Typography>
      {custom ? (
        <div className="grid gap-2">
          <Field>
            <Field.Label>{t('sessionStart.name.label')}</Field.Label>
            <TextInput
              ref={inputRef}
              value={choice.value}
              maxLength={sessionNameMaxLength}
              disabled={locked}
              placeholder={t('sessionStart.name.placeholder')}
              onChange={(event) => onChange({ ...choice, value: event.target.value })}
            />
            <Field.Description>
              {remaining <= 32
                ? t('sessionStart.name.remaining', { remaining })
                : t('sessionStart.name.limit', { max: sessionNameMaxLength })}
            </Field.Description>
          </Field>
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={() => {
                onChange({ ...choice, mode: 'agent' });
                // The field disappears: focus goes to the control that brings it back.
                requestAnimationFrame(() => customRef.current?.focus());
              }}
            >
              {t('sessionStart.name.useAgent')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Typography as="p" variant="body-md" className="min-w-0 flex-1 text-content-secondary">
            {t('sessionStart.name.agentDefault')}
          </Typography>
          <Button
            ref={customRef}
            variant="secondary"
            size="sm"
            disabled={locked}
            onClick={() => {
              onChange({ ...choice, mode: 'custom' });
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {t('sessionStart.name.useCustom')}
          </Button>
        </div>
      )}
    </section>
  );
}
