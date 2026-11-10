import { useId, useMemo, type MutableRefObject, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, cn } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  AgentFields,
  ProviderChoice,
  selectProvider,
  startCatalogueFromDemo,
  type AgentChoice,
} from '../../../sessions';
import { createControlWidth } from '../createFormLayout';

/**
 * The agent of the Specification's initial Session: the provider tiles, then the same labelled
 * Model, Effort and Work mode fields the Session start form uses (`AgentFields`, full-session.md
 * "Starting a Session"). The first message is written in the Session itself, so there is
 * none here.
 */
export function CreateAgentSection({
  catalogue,
  choice,
  locked,
  onChange,
  providerError,
  modelError,
  effortError,
  modeError,
  providersRef,
  modelControlRef,
  effortControlRef,
  modeControlRef,
}: {
  catalogue: DemoCatalogue;
  choice: AgentChoice;
  locked: boolean;
  onChange: (choice: AgentChoice) => void;
  /** Why the provider blocks Create (once tried): shown under the cards, tied to their group. */
  providerError?: string;
  /** Why the missing model blocks Create (once tried). */
  modelError?: string;
  /** Why the effort blocks Create (once tried). */
  effortError?: string;
  /** Why the work mode blocks Create (once tried). */
  modeError?: string;
  /** The provider cards, so a blocked Create can lead to them. */
  providersRef?: RefObject<HTMLDivElement | null>;
  modelControlRef?: MutableRefObject<HTMLElement | null>;
  effortControlRef?: MutableRefObject<HTMLElement | null>;
  modeControlRef?: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const start = useMemo(() => startCatalogueFromDemo(catalogue), [catalogue]);
  const legendId = useId();
  const providerErrorId = useId();

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
        {/* Capped like every Create control, and its own container: the cards choose their
            columns from this width, not from the frame's. */}
        <div ref={providersRef} className={cn('@container', createControlWidth)}>
          <ProviderChoice
            catalogue={start}
            providerId={choice.providerId}
            labelledBy={legendId}
            invalid={Boolean(providerError)}
            describedBy={providerError ? providerErrorId : undefined}
            onSelect={(providerId) =>
              onChange(
                selectProvider(
                  choice,
                  start.providers.find((p) => p.id === providerId),
                ),
              )
            }
          />
          {providerError && (
            <p id={providerErrorId} className="m-0 mt-2 text-body-sm text-content-error">
              {providerError}
            </p>
          )}
        </div>
      </fieldset>
      <div className={createControlWidth}>
        <AgentFields
          catalogue={start}
          choice={choice}
          locked={locked}
          onChange={onChange}
          modelError={modelError}
          modelControlRef={modelControlRef}
          effortError={effortError}
          effortControlRef={effortControlRef}
          modeError={modeError}
          modeControlRef={modeControlRef}
        />
      </div>
    </div>
  );
}
