import { useId, useRef, type RefObject } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Icon, Typography, cn } from '@nevo/ui';
import type { ArchetypeFirstStep } from '@nevo/specflow-contracts/documents';
import { productIcons } from '../../../../shared/product-icons';
import { TextAction } from '../../../../shared/actions/TextAction';
import { workModeFor } from '@nevo/specflow-contracts/sessions';
import { AgentAvailabilityNote, agentCanStart } from '../../../sessions';
import { AgentSession, type AgentCatalogue, type FreshChoice } from '../../../tasks';
import { createControlWidth } from '../createFormLayout';

/**
 * The agent path's one extra section of the Create form, in the right column above the workspace:
 * what happens right after Create, the step the agent starts and the same agent and model picker as
 * Run with agent (`AgentSession`, a new Session) and the work mode its Session starts in, with the
 * Session start screen's availability note only when the chosen agent cannot start (the other
 * agents' state stays in their tiles). An archetype whose first step only the owner can do (or that starts
 * no workflow) shows one line instead, with **Use Manually**, which switches to the manual form and
 * keeps the draft.
 */
export function CreateAgentStepSection({
  firstStep,
  agents,
  refreshing,
  onRefresh,
  choice,
  onChoice,
  onUseManual,
  providersRef,
}: {
  /** The selected archetype's first step; undefined when it starts no workflow. */
  firstStep: ArchetypeFirstStep | undefined;
  agents: AgentCatalogue;
  refreshing: boolean;
  onRefresh: () => void;
  choice: FreshChoice;
  onChoice: (choice: FreshChoice) => void;
  onUseManual: () => void;
  /** The agent tiles, so a blocked Create can lead to them. */
  providersRef?: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const noteId = useId();
  const fallback = useRef<HTMLDivElement>(null);
  const runnable = firstStep?.agent === true;
  const ready = agents.status === 'ready' ? agents : undefined;
  // The chosen agent can start: the others' state is in their tiles, not a warning under them.
  const chosenCanStart = ready ? agentCanStart(ready.catalogue, choice.providerId) : false;
  // The mode the Runtime starts the agent's Session in (the same rule), said as Run with agent says it.
  const workMode = ready
    ? workModeFor(
        ready.providers.find((provider) => provider.providerId === choice.providerId),
        choice.modelId,
      )?.title
    : undefined;

  return (
    <section className={cn('grid gap-4', createControlWidth)} aria-labelledby={headingId}>
      <div className="grid gap-1">
        <Typography as="h2" id={headingId} variant="title-md">
          {t('create.agentStep.title')}
        </Typography>
        {runnable && (
          <Typography as="p" variant="body-md" className="text-content-secondary">
            {t('create.agentStep.intro')}
          </Typography>
        )}
      </div>
      {firstStep && (
        <p className="m-0 flex items-center gap-2 text-body-md text-content-primary">
          <Icon
            name={productIcons.workflowStep}
            size="sm"
            aria-hidden="true"
            className="text-content-secondary"
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <Trans
              i18nKey="create.agentStep.firstStep"
              values={{ step: firstStep.title }}
              components={{ step: <strong className="font-semibold" /> }}
            />
          </span>
        </p>
      )}
      {!runnable ? (
        <p className="m-0 text-body-md text-content-primary">
          {firstStep ? t('create.agentStep.ownerFirst') : t('create.agentStep.noWorkflow')}{' '}
          <TextAction onClick={onUseManual}>{t('create.agentStep.useManual')}</TextAction>
        </p>
      ) : (
        <div ref={fallback} className="grid gap-3">
          <div ref={providersRef} className="min-w-0">
            {agents.status === 'error' ? (
              <div role="status" className="grid gap-1">
                <Typography as="p" variant="body-sm" className="text-content-secondary">
                  {t('create.start.agentUnavailable.failed')}
                </Typography>
                <p className="m-0 text-body-sm">
                  <TextAction disabled={refreshing} onClick={onRefresh}>
                    {t('sessionStart.diagnostics.checkAgain')}
                  </TextAction>
                </p>
              </div>
            ) : (
              <AgentSession
                mode="fresh"
                independent={false}
                step={firstStep.title}
                role={t('workflowExecution.agent.roleFallback')}
                launch={undefined}
                catalogue={agents}
                choice={choice}
                preselected={false}
                workMode={chosenCanStart ? workMode : undefined}
                onChoice={onChoice}
              />
            )}
          </div>
          {ready && !chosenCanStart && (
            <AgentAvailabilityNote
              id={noteId}
              catalogue={ready.catalogue}
              refreshing={refreshing}
              onRefresh={onRefresh}
              focusFallback={() => fallback.current}
            />
          )}
        </div>
      )}
    </section>
  );
}
