import { useId, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { useMessage } from '../../../../../i18n/message';
import { selectProvider, type AgentChoice } from '../../options/agentChoice';
import { newSessionReadiness } from '../../new-session/newSessionReadiness';
import { AgentFields } from '../AgentFields';
import { ProviderChoice } from '../ProviderChoice';
import { SessionNameSection } from '../SessionNameSection';
import type { SessionNameChoice } from '../sessionName';
import { StartFormActions } from './StartFormActions';

/** `failed`: the last start did not succeed; the choices are kept and the form is unlocked. */
export type SessionStartStatus = 'idle' | 'starting' | 'failed';

/**
 * Where a new Session is started, inside the Session screen's conversation column
 * (new-session-ui-spec.md section 5): provider tiles, then the labelled Model, Effort and Work mode
 * fields (`AgentFields`), then the optional own name, then the note and **Start session**. Fully
 * controlled: the owner holds the choice and runs the start, the form only presents it and reports
 * `onStart` once, when the choice is complete.
 */
export function SessionStartForm({
  catalogue,
  agent,
  onAgentChange,
  name,
  onNameChange,
  status,
  configurationUnavailable = false,
  onStart,
}: {
  catalogue: DemoCatalogue;
  agent: AgentChoice;
  onAgentChange: (agent: AgentChoice) => void;
  name: SessionNameChoice;
  onNameChange: (name: SessionNameChoice) => void;
  status: SessionStartStatus;
  configurationUnavailable?: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const titleId = useId();
  const agentId = useId();
  const noteId = useId();
  const starting = status === 'starting';
  const { prerequisite, canStart } = newSessionReadiness({
    catalogue,
    agent,
    name,
    configurationUnavailable,
  });
  const note = prerequisite
    ? text(prerequisite)
    : name.mode === 'agent'
      ? t('sessionStart.footer.agentNames')
      : t('sessionStart.footer.ready');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canStart && !starting) {
      onStart();
    }
  };

  return (
    // A container: the provider tiles take their columns from the form's own width.
    <form aria-labelledby={titleId} onSubmit={submit} className="@container">
      <div className="grid gap-6">
        <div className="grid gap-1">
          <Typography as="h2" variant="title-md" id={titleId}>
            {t('sessionStart.form.title')}
          </Typography>
        </div>
        <fieldset disabled={starting} className="grid min-w-0">
          {/* A rendered `<legend>` takes no part in the fieldset's grid gap: its own margin gives the
              label-to-control spacing of a DS `Field` (`gap-1.5`), like Model and Effort below. */}
          <Typography as="legend" variant="label-md" id={agentId} className="mb-1.5 p-0">
            {t('sessionStart.agent.heading')}
          </Typography>
          <ProviderChoice
            catalogue={catalogue}
            providerId={agent.providerId}
            labelledBy={agentId}
            onSelect={(providerId) => onAgentChange(selectProvider(agent, providerId))}
          />
        </fieldset>
        <AgentFields
          catalogue={catalogue}
          choice={agent}
          locked={starting}
          onChange={onAgentChange}
        />
        <SessionNameSection
          choice={name}
          locked={starting}
          onChange={onNameChange}
          headingLevel="h3"
        />
        {status === 'failed' && (
          <Alert tone="danger" role="alert" title={t('sessionStart.form.failedTitle')}>
            {t('sessionStart.form.failedBody')}
          </Alert>
        )}
        <StartFormActions
          noteId={noteId}
          note={note}
          label={starting ? t('sessionStart.form.starting') : t('sessionStart.submit.start')}
          disabled={starting || !canStart}
          pending={starting}
        />
      </div>
    </form>
  );
}
