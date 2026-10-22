import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, Field, SegmentedControl, StatusIndicator, Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { useMessage } from '../../../i18n/message';
import { SessionProviderIcon } from '../../sessions';
import {
  modeLabel,
  providerDefaultEffort,
  selectModel,
  selectProvider,
  supportedModes,
  type AgentChoice,
} from './agentChoice';
import { ChoiceTile, ChoiceTileGroup } from './ChoiceTile';
import { LocalizedOptionPicker } from '../../../shared/controls/LocalizedOptionPicker';
import { providerStatus } from './providerStatus';

/** Provider, model, effort and mode of the agent that writes the specification or runs the Session. */
export function CreateAgentSection({
  catalogue,
  specId,
  choice,
  locked,
  onChange,
}: {
  catalogue: DemoCatalogue;
  specId?: string;
  choice: AgentChoice;
  locked: boolean;
  onChange: (choice: AgentChoice) => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const legendId = useId();
  const { providerId, modelId, effort, mode } = choice;
  const provider = catalogue.providers.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  const providerColumns = cn(
    catalogue.providers.length === 3
      ? '@2xl:grid-cols-3'
      : catalogue.providers.length > 1 && '@lg:grid-cols-2',
    catalogue.providers.length >= 5 && '@2xl:grid-cols-3',
  );
  return (
    <div className="grid gap-4">
      <fieldset disabled={locked} className="grid gap-4">
        <div className="grid gap-1">
          <Typography as="legend" id={legendId} variant="title-md" className="p-0">
            {specId ? t('create.agent.sessionTitle') : t('create.agent.initialTitle')}
          </Typography>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            {specId ? t('create.agent.introSession') : t('create.agent.introInitial')}
          </Typography>
        </div>
        {catalogue.providers.length === 0 && (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('create.agent.noProviders')}
          </Typography>
        )}
        <ChoiceTileGroup aria-labelledby={legendId} columns={providerColumns}>
          {catalogue.providers.map((p) => {
            const status = providerStatus(p, catalogue);
            return (
              <ChoiceTile
                key={p.id}
                name="provider"
                value={p.id}
                checked={providerId === p.id}
                disabled={!p.available}
                onSelect={() => onChange(selectProvider(choice, p.id))}
                icon={<SessionProviderIcon providerId={p.mark} />}
                title={p.title}
                description={status.access ? text(status.access) : undefined}
                meta={
                  p.available ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {status.tone && <StatusIndicator tone={status.tone} />}
                      {text(status.availability)}
                    </span>
                  ) : (
                    <span>{text(status.availability)}</span>
                  )
                }
                note={status.note}
              />
            );
          })}
        </ChoiceTileGroup>
      </fieldset>
      <div
        className={cn('grid gap-4', model && model.efforts.length > 0 && '@sm:grid-cols-[2fr_1fr]')}
      >
        <Field>
          <Field.Label>{t('create.model')}</Field.Label>
          <LocalizedOptionPicker
            value={modelId}
            placeholder={t('create.chooseModel')}
            disabled={locked}
            onValueChange={(id) => onChange(selectModel(choice, provider, id))}
            items={(provider?.models ?? []).map((m) => ({
              value: m.id,
              textValue: m.title,
              label: m.title,
            }))}
          />
        </Field>
        {model && model.efforts.length > 0 && (
          <Field>
            <Field.Label>{t('create.effort')}</Field.Label>
            <LocalizedOptionPicker
              value={effort}
              disabled={locked}
              onValueChange={(next) => onChange({ ...choice, effort: next })}
              items={[
                {
                  value: providerDefaultEffort,
                  textValue: t('create.providerDefault'),
                  label: t('create.providerDefault'),
                },
                ...model.efforts.map((e) => ({ value: e, textValue: e, label: e })),
              ]}
            />
          </Field>
        )}
      </div>
      {model && (
        <Field>
          <Field.Label>{t('create.mode')}</Field.Label>
          {model.modes.length === 1 ? (
            <Typography as="p" variant="body-md" className="text-content-primary">
              {modeLabel(model.modes[0]!)}
            </Typography>
          ) : (
            <SegmentedControl
              value={mode}
              onValueChange={(next) => onChange({ ...choice, mode: next })}
              aria-label={t('create.mode')}
              className="w-fit max-w-full"
            >
              {supportedModes(model.modes).map((m) => (
                <SegmentedControl.Item key={m} value={m} disabled={locked}>
                  {modeLabel(m)}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          )}
        </Field>
      )}
    </div>
  );
}
