import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  AgentFields,
  ProviderChoice,
  selectProvider,
  startCatalogueFromDemo,
  type AgentChoice,
} from '../../../sessions';

/**
 * The agent of the Specification's initial Session: the provider tiles, then the same labelled
 * Model, Effort and Work mode fields the Session start form uses (`AgentFields`, new-session-ui-spec.md
 * section 9). The first message is written in the Session itself, so there is none here.
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
  const start = useMemo(() => startCatalogueFromDemo(catalogue), [catalogue]);
  const legendId = useId();

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
      <AgentFields catalogue={start} choice={choice} locked={locked} onChange={onChange} />
    </div>
  );
}
