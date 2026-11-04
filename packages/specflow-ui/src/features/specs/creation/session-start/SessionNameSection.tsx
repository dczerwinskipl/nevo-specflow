import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, Typography } from '@nevo/ui';
import { OwnValueSetting } from '../form/OwnValueSetting';
import { sessionNameMaxLength, type SessionNameChoice } from './sessionName';

/**
 * The Session's name, composed like Create's branch name (`OwnValueSetting`): by default the agent
 * names it from the first message (said in the switch description), the switch "Give it your own
 * name" reveals the name field. Switching back keeps the typed text for a later switch, but the
 * agent names the Session.
 */
export function SessionNameSection({
  choice,
  locked,
  onChange,
  headingLevel = 'h2',
}: {
  choice: SessionNameChoice;
  locked: boolean;
  onChange: (choice: SessionNameChoice) => void;
  /** One level lower where the section sits inside a card that has its own `h2` title. */
  headingLevel?: 'h2' | 'h3';
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const custom = choice.mode === 'custom';
  const remaining = sessionNameMaxLength - choice.value.length;

  return (
    <section className="grid gap-4" aria-labelledby={headingId}>
      <div className="grid gap-1">
        <Typography as={headingLevel} variant="title-md" id={headingId}>
          {t('sessionStart.name.heading')}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {t('sessionStart.name.intro')}
        </Typography>
      </div>
      <OwnValueSetting
        className="grid grid-cols-1 gap-3"
        switchLabel={t('sessionStart.name.useCustom')}
        switchDescription={
          custom ? t('sessionStart.name.customDescription') : t('sessionStart.name.agentDefault')
        }
        on={custom}
        disabled={locked}
        onOnChange={(on) => onChange({ ...choice, mode: on ? 'custom' : 'agent' })}
        fieldLabel={t('sessionStart.name.label')}
        fieldDescription={
          remaining <= 32
            ? t('sessionStart.name.remaining', { remaining })
            : t('sessionStart.name.limit', { max: sessionNameMaxLength })
        }
      >
        <TextInput
          value={choice.value}
          maxLength={sessionNameMaxLength}
          disabled={locked}
          placeholder={t('sessionStart.name.placeholder')}
          onChange={(event) => onChange({ ...choice, value: event.target.value })}
        />
      </OwnValueSetting>
    </section>
  );
}
