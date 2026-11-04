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
 * What the agent starts with, as labelled fields (new-session-ui-spec.md section 6): Model, Effort
 * and Work mode. Always all three once a provider is chosen, so choosing a model never adds rows;
 * Effort and Work mode stay disabled until a model decides which efforts and modes exist (a
 * provider that offers no model choice shows Model disabled at the provider default and decides
 * them itself). The same composition serves the start form and Create's agent section; the Composer
 * keeps its compact pickers. The provider itself is chosen with `ProviderChoice`.
 */
export function AgentFields({
  catalogue,
  choice,
  locked = false,
  onChange,
}: {
  catalogue: StartCatalogue;
  choice: AgentChoice;
  locked?: boolean;
  onChange: (choice: AgentChoice) => void;
}) {
  const provider = catalogue.providers.find((p) => p.id === choice.providerId);
  if (!provider) {
    return null;
  }

  const model = provider.models.find((m) => m.id === choice.modelId);
  const decidedByModel = locked || !provider.available || (offersModelChoice(provider) && !model);

  return (
    <div className="grid gap-4">
      <ModelField
        provider={provider}
        value={choice.modelId}
        disabled={locked || !provider.available || !offersModelChoice(provider)}
        onChange={(modelId) => onChange(selectModel(choice, provider, modelId))}
      />
      <EffortField
        efforts={model?.efforts ?? []}
        value={choice.effort}
        disabled={decidedByModel}
        onChange={(effort) => onChange({ ...choice, effort })}
      />
      <WorkModeField
        modes={listedModes(provider, model)}
        value={choice.mode}
        disabled={decidedByModel}
        onChange={(mode) => onChange({ ...choice, mode })}
      />
    </div>
  );
}
