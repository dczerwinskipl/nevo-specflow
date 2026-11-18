import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import {
  listedModes,
  offersModelChoice,
  selectModel,
  type AgentChoice,
} from '../choice/agentChoice';
import { EffortField } from './EffortField';
import { ModelField } from './ModelField';
import { WorkModeField } from './WorkModeField';

/**
 * Model, Effort and Work mode of the chosen agent as one group, following what the provider
 * offers: a provider without a model choice shows the fact ("Provider default"), not a disabled
 * picker; Effort appears only for a provider whose models have efforts. Within one provider the set
 * never changes, so choosing a model adds no rows. A wide form shows one row; a narrow one stacks.
 * Nothing shows until an available agent is chosen.
 */
export function AgentSettings({
  catalogue,
  choice,
  locked,
  onChange,
}: {
  catalogue: StartCatalogue;
  choice: AgentChoice;
  locked: boolean;
  onChange: (choice: AgentChoice) => void;
}) {
  const { t } = useTranslation();
  const provider = catalogue.providers.find((p) => p.id === choice.providerId);
  if (!provider?.available) {
    return null;
  }

  const model = provider.models.find((m) => m.id === choice.modelId);
  const choosesModel = offersModelChoice(provider);
  const hasEfforts = provider.models.some((m) => m.efforts.length > 0);
  const decidedByModel = locked || (choosesModel && !model);

  return (
    <div
      role="group"
      aria-label={t('sessionStart.fields.settings')}
      className="grid gap-4 @xl:flex @xl:flex-wrap @xl:items-start @xl:gap-x-3"
    >
      <div className="min-w-0 @xl:flex-[1_1_14rem]">
        {choosesModel ? (
          <ModelField
            provider={provider}
            value={choice.modelId}
            disabled={locked}
            onChange={(modelId) => onChange(selectModel(choice, provider, modelId))}
          />
        ) : (
          <div className="grid gap-1.5">
            <Typography as="span" variant="label-md" className="text-content-secondary">
              {t('managedSession.model.sectionLabel')}
            </Typography>
            <Typography
              as="p"
              variant="body-md"
              className="flex min-h-control-height-default items-center text-content-primary"
            >
              {t('sessionStart.fields.providerDefaultModel')}
            </Typography>
          </div>
        )}
      </div>
      {hasEfforts && (
        <div className="min-w-0 @xl:w-40">
          <EffortField
            efforts={model?.efforts ?? []}
            value={choice.effort}
            disabled={decidedByModel}
            onChange={(effort) => onChange({ ...choice, effort })}
          />
        </div>
      )}
      <div className="min-w-0 @xl:shrink-0 @xl:[&_button]:whitespace-nowrap">
        <WorkModeField
          modes={listedModes(provider, model)}
          value={choice.mode}
          disabled={decidedByModel}
          onChange={(mode) => onChange({ ...choice, mode })}
        />
      </div>
    </div>
  );
}
