import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { selectProvider, type AgentChoice } from './agentChoice';
import { AgentSettings } from '../session-start/AgentSettings';
import { ProviderChoice } from '../session-start/ProviderChoice';

/**
 * The agent of the specification's initial Session: the shared start block without a first
 * message (the Session opens idle and the message is written in its Composer). Provider tiles, then
 * the work mode and model · effort with the Composer's own pickers.
 */
export function CreateAgentSection({
  catalogue,
  choice,
  locked,
  onChange,
}: {
  catalogue: DemoCatalogue;
  choice: AgentChoice;
  locked: boolean;
  onChange: (choice: AgentChoice) => void;
}) {
  const { t } = useTranslation();
  const legendId = useId();
  const settingsId = useId();

  return (
    <div className="grid gap-4">
      <fieldset disabled={locked} className="grid gap-4">
        <div className="grid gap-1">
          <Typography as="legend" id={legendId} variant="title-md" className="p-0">
            {t('create.agent.initialTitle')}
          </Typography>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            {t('create.agent.introInitial')}
          </Typography>
        </div>
        <ProviderChoice
          catalogue={catalogue}
          providerId={choice.providerId}
          labelledBy={legendId}
          onSelect={(providerId) => onChange(selectProvider(choice, providerId))}
        />
      </fieldset>
      <div className="grid gap-1.5">
        <Typography as="p" variant="label-md" id={settingsId}>
          {t('create.agent.settingsLabel')}
        </Typography>
        <div
          role="group"
          aria-labelledby={settingsId}
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          <AgentSettings
            catalogue={catalogue}
            choice={choice}
            locked={locked}
            onChange={onChange}
            placement="inline"
          />
        </div>
      </div>
    </div>
  );
}
