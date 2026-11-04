import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, SegmentedControl } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import {
  providerDefaultEffort,
  selectModel,
  supportedModes,
  type AgentChoice,
} from '../options/agentChoice';

type Provider = DemoCatalogue['providers'][number];

/**
 * The model titles are the labels; the model id is shown as `meta` only for the titles that repeat,
 * where the title alone cannot tell two models apart.
 */
function modelItems(provider: Provider) {
  const counts = new Map<string, number>();
  for (const model of provider.models) {
    counts.set(model.title, (counts.get(model.title) ?? 0) + 1);
  }

  return provider.models.map((model) => ({
    value: model.id,
    textValue: model.title,
    label: model.title,
    meta: (counts.get(model.title) ?? 0) > 1 ? model.id : undefined,
  }));
}

/**
 * What the agent starts with, as labelled fields (new-session-ui-spec.md section 6): Model, Effort
 * and Work mode. Always all three once a provider is chosen, so choosing a model never adds rows;
 * Effort and Work mode stay disabled until a model decides which efforts and modes exist. The same
 * composition serves the start card and Create's agent section; the Composer keeps its compact
 * pickers. The provider itself is chosen with `ProviderChoice`.
 */
export function AgentFields({
  catalogue,
  choice,
  locked = false,
  onChange,
}: {
  catalogue: DemoCatalogue;
  choice: AgentChoice;
  locked?: boolean;
  onChange: (choice: AgentChoice) => void;
}) {
  const { t } = useTranslation();
  const effortId = useId();
  const provider = catalogue.providers.find((p) => p.id === choice.providerId);
  if (!provider) {
    return null;
  }

  const model = provider.models.find((m) => m.id === choice.modelId);
  const modes = supportedModes(provider, model);
  const efforts = model?.efforts ?? [];
  const modelUnavailable = locked || !provider.available;
  const decidedByModel = modelUnavailable || !model;

  return (
    <div className="grid gap-4">
      <Field>
        <Field.Label>{t('managedSession.model.sectionLabel')}</Field.Label>
        <LocalizedOptionPicker
          value={choice.modelId}
          disabled={modelUnavailable}
          placeholder={t('managedSession.model.placeholder')}
          onValueChange={(modelId) => onChange(selectModel(choice, provider, modelId))}
          items={modelItems(provider)}
        />
      </Field>
      <Field controlId={effortId} disabled={decidedByModel}>
        <Field.Label>{t('sessionStart.fields.effort')}</Field.Label>
        <SegmentedControl
          aria-labelledby={`${effortId}-label`}
          className="w-full"
          value={choice.effort}
          onValueChange={(effort) => onChange({ ...choice, effort })}
        >
          {[providerDefaultEffort, ...efforts].map((effort) => (
            <SegmentedControl.Item
              key={effort}
              value={effort}
              disabled={decidedByModel || efforts.length === 0}
            >
              {effort === providerDefaultEffort ? t('sessionStart.fields.effortDefault') : effort}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </Field>
      <Field disabled={decidedByModel}>
        <Field.Label>{t('managedSession.intent.sectionLabel')}</Field.Label>
        <LocalizedOptionPicker
          value={choice.mode}
          disabled={decidedByModel}
          placeholder={t('managedSession.intent.placeholder')}
          onValueChange={(mode) => onChange({ ...choice, mode })}
          items={modes.map((mode) => ({
            value: mode.id,
            textValue: mode.title,
            label: mode.title,
          }))}
        />
      </Field>
    </div>
  );
}
