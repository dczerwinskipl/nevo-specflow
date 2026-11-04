import { useTranslation } from 'react-i18next';
import { useWorkspaceCapabilities } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import {
  applyModelEffort,
  ComposerModePicker,
  ModelEffortPicker,
  modelEffortValue,
  modeValue,
  pickerModes,
  pickerProvider,
  type AgentChoice,
  type StartCatalogue,
} from '../../../sessions';

/**
 * The first Turn's work mode and model · effort, shown with the Session Composer's own pickers so a
 * Session starts with exactly the controls it continues with. The work mode appears once a model
 * is chosen (the model decides which modes exist). Renders the two triggers only, side by side; the
 * caller places them (the agent row of Create and of New Session).
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
  const text = useMessage();
  const { supportsSplit } = useWorkspaceCapabilities();
  const provider = catalogue.providers.find((p) => p.id === choice.providerId);

  const mode = (
    <div key="mode" className="flex min-w-0 items-center gap-1">
      <ComposerModePicker
        options={pickerModes(provider, choice.modelId, text)}
        value={modeValue(choice)}
        onChange={(mode) => onChange({ ...choice, mode })}
        disabled={locked}
        compact={!supportsSplit}
      />
    </div>
  );
  const model = (
    <div key="model" className="flex shrink-0 items-center gap-2">
      <ModelEffortPicker
        provider={pickerProvider(provider)}
        value={modelEffortValue(choice)}
        onChange={(modelId, effort) =>
          onChange(applyModelEffort(choice, provider, modelId, effort))
        }
        disabled={locked || !provider?.available}
        compact={!supportsSplit}
        defaultEffortLabel={t('create.providerDefault')}
      />
    </div>
  );

  // The model comes first (in reading and focus order alike) because it decides which work modes
  // exist.
  return <>{[model, mode]}</>;
}
