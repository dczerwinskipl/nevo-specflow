import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  ProviderChoice,
  selectProvider,
  startCatalogueFromDemo,
  type AgentChoice,
} from '../../../sessions';
import { AgentSettings } from '../session-start/AgentSettings';

/**
 * The agent of a new Session (the specification's initial one, or New Session's): the shared start block without a first
 * message (the Session opens idle and the message is written in its Composer). Provider tiles, then
 * the work mode and model · effort with the Composer's own pickers.
 */
export function CreateAgentSection({
  catalogue,
  choice,
  locked,
  onChange,
  title,
  intro,
}: {
  catalogue: DemoCatalogue;
  choice: AgentChoice;
  locked: boolean;
  onChange: (choice: AgentChoice) => void;
  /** The section heading and intro; Create's own wording by default. */
  title?: string;
  intro?: string;
}) {
  const { t } = useTranslation();
  const start = useMemo(() => startCatalogueFromDemo(catalogue), [catalogue]);
  const legendId = useId();
  const settingsId = useId();

  return (
    <div className="grid gap-4">
      <fieldset disabled={locked} className="grid gap-4">
        <div className="grid gap-1">
          <Typography as="legend" id={legendId} variant="title-md" className="p-0">
            {title ?? t('create.agent.initialTitle')}
          </Typography>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            {intro ?? t('create.agent.introInitial')}
          </Typography>
        </div>
        <ProviderChoice
          catalogue={start}
          providerId={choice.providerId}
          labelledBy={legendId}
          onSelect={(providerId) =>
            onChange(
              selectProvider(
                choice,
                start.providers.find((p) => p.id === providerId),
              ),
            )
          }
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
          <AgentSettings catalogue={start} choice={choice} locked={locked} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}
