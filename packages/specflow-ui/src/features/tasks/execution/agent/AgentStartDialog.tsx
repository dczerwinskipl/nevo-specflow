import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bot, GitCommitHorizontal } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineNote,
} from '@nevo/ui';
import type { AgentOption } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import { startCatalogueFromProviders } from '../../../sessions';
import { focusInitial } from '../focusInitial';
import type { WorkflowSubjectRef } from '../api';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';
import { AgentBlocker } from './AgentBlocker';
import {
  AgentSession,
  type AgentCatalogue,
  type FreshChoice,
  type SessionMode,
} from './AgentSession';
import { NO_AGENT_REASONS, archetypeTitle, optionOfRefusal } from './agentOption';
import { useAgentStart } from './useAgentStart';

const CODE = <span className="font-mono whitespace-nowrap text-content-primary" />;

export interface AgentStartDialogProps {
  readonly subject: WorkflowSubjectRef;
  /** The step the owner was shown (the projection's `next`). */
  readonly step: { readonly id: string; readonly title: string };
  /** The agent role the projection names, when it does (an unavailable option may not). */
  readonly archetype?: string | undefined;
  /**
   * Hand to agent (`actions.handToAgent`): the owner's attempt that ends; the agent goes on with
   * the step in the next attempt. Absent: Run with agent starts a new attempt of the ready step.
   */
  readonly handOver?: { readonly attempt: number } | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The Session section's mode: the workflow decides it, from the option and its launch. */
function sessionModeOf(option: AgentOption): SessionMode {
  if (option.kind === 'unavailable') {
    if (option.reason === 'session-unavailable') {
      return 'gone';
    }

    if ((NO_AGENT_REASONS as readonly string[]).includes(option.reason) && !option.launch) {
      return 'not-chosen';
    }
  }

  return option.launch?.session.mode === 'reuse' ? 'reuse' : 'fresh';
}

/**
 * Run with agent (or Hand to agent, from the owner's own attempt): what happens, what blocks the start (read from the Runtime when the dialog opens,
 * before anything is sent), the Session the attempt runs in and the commit disclosure. The footer is
 * Cancel and the one primary action, disabled while anything blocks; Check again is inside the
 * blocker's alert. A refusal of the start that names the agent (or the dirty checkout) shows the same
 * blocker; any other refusal is explained by its code.
 */
export function AgentStartDialog({
  subject,
  step,
  archetype,
  handOver,
  open,
  onOpenChange,
}: AgentStartDialogProps) {
  const { t } = useTranslation();
  const { managedSessionsApi, specificationApi } = useAppServices();
  const { check, start } = useAgentStart(subject, step.id, open, handOver);
  // Literal keys (not a prefix) so the catalogue check sees every key the dialog uses.
  const copy = handOver
    ? {
        title: t('workflowExecution.agent.hand.title', { step: step.title || step.id }),
        description:
          subject.taskId === undefined
            ? t('workflowExecution.agent.hand.descriptionSpecification', {
                attempt: handOver.attempt,
              })
            : t('workflowExecution.agent.hand.descriptionTask', {
                task: subject.taskId,
                attempt: handOver.attempt,
              }),
        submit: t('workflowExecution.agent.hand.submit'),
        submitting: t('workflowExecution.agent.hand.submitting'),
      }
    : {
        title: t('workflowExecution.agent.title', { step: step.title || step.id }),
        description:
          subject.taskId === undefined
            ? t('workflowExecution.agent.descriptionSpecification')
            : t('workflowExecution.agent.descriptionTask', { task: subject.taskId }),
        submit: t('workflowExecution.agent.submit'),
        submitting: t('workflowExecution.agent.submitting'),
      };
  const workspace = useSpecificationWorkspace(subject.specId, specificationApi).data;
  const [chosen, setChosen] = useState<FreshChoice>();

  const refusedOption = start.isError ? optionOfRefusal(start.error) : undefined;
  const option: AgentOption | undefined = refusedOption ?? check.data?.agent;
  const launch = option?.launch;
  const archetypeName = archetypeTitle(launch?.archetype ?? archetype ?? '');
  // The Runtime names no role when it knows no agent for the step: the copy then says "an agent".
  const roleName = archetypeName
    ? t('workflowExecution.agent.role', { name: archetypeName })
    : undefined;
  const mode = option ? sessionModeOf(option) : 'fresh';
  const fresh = mode === 'fresh';
  const independent = option?.independent === true;

  const providers = useQuery({
    queryKey: ['workflow', 'agent-providers', subject.specId],
    queryFn: ({ signal }) => managedSessionsApi.providers({ specId: subject.specId }, signal),
    enabled: open && launch !== undefined,
    retry: false,
  });
  const catalogue: AgentCatalogue = providers.data
    ? {
        status: 'ready',
        catalogue: startCatalogueFromProviders(providers.data.items),
        providers: providers.data.items,
      }
    : providers.isError
      ? { status: 'error' }
      : { status: 'loading' };
  const choice: FreshChoice =
    chosen ??
    (launch
      ? {
          providerId: launch.provider,
          modelId: launch.model,
          ...(launch.effort ? { effort: launch.effort } : {}),
        }
      : { providerId: '', modelId: '' });
  const chosenReady =
    catalogue.status !== 'ready' ||
    catalogue.catalogue.providers.some(
      (provider) => provider.id === choice.providerId && provider.available,
    );
  // A new Session's model the chosen provider does not offer (the role's settings name an id the
  // catalogue does not list, or the check says a model must be chosen) is not assigned: the picker
  // asks for one of the provider's models and Start waits for it. The unknown id is never shown
  // (owner, 2026-11-25).
  const chosenProvider =
    catalogue.status === 'ready'
      ? catalogue.providers.find((provider) => provider.providerId === choice.providerId)
      : undefined;
  const modelRequired =
    chosen === undefined && option?.kind === 'available' && option.modelRequired === true;
  const modelUnassigned =
    fresh &&
    chosenProvider !== undefined &&
    // A provider that lists no models runs its own default: nothing to choose.
    chosenProvider.models.length > 0 &&
    (modelRequired || !chosenProvider.models.some((model) => model.modelId === choice.modelId));
  // No model yet, but the agent settings' effort stays the suggestion for the one the owner picks.
  const pickerChoice: FreshChoice = modelUnassigned
    ? {
        providerId: choice.providerId,
        modelId: '',
        ...(choice.effort ? { effort: choice.effort } : {}),
      }
    : choice;
  const choose = (next: FreshChoice) => {
    // A refusal was for the earlier choice: another one is checked again by its own start.
    start.reset();
    setChosen(next);
  };

  // A provider that is not ready only blocks the agent the workflow
  // preselected: for a new Session the owner may pick a ready one (D18), and the start checks it
  // again. A continued Session has no picker.
  const pickable =
    option?.kind === 'unavailable' &&
    option.reason === 'provider-not-ready' &&
    fresh &&
    launch !== undefined &&
    catalogue.status === 'ready';
  // A refused start is always said, even when the owner could pick another agent (dogfood #189: a
  // refusal of the preselected model left the dialog silent). A model that is not offered is the
  // picker's empty choice, not a blocker.
  const blocked =
    option?.kind === 'unavailable' && (refusedOption !== undefined || !(pickable && chosenReady));
  const canStart =
    !start.isPending &&
    !modelUnassigned &&
    refusedOption === undefined &&
    ((option?.kind === 'available' && (!fresh || chosenReady)) || (pickable && chosenReady));
  const otherRefusal = start.isError && !refusedOption;
  // The Runtime names the work mode for the launch it resolved; another choice may run in another
  // mode, so it is shown only for that one. A continued Session keeps its own mode.
  const sameAsLaunch =
    launch?.session.mode === 'reuse' ||
    (!modelUnassigned && choice.providerId === launch?.provider && choice.modelId === launch.model);
  const workModeTitle = option?.kind === 'available' ? option.workMode?.title : undefined;
  const reused = launch?.session.mode === 'reuse' ? launch.session.sessionId : undefined;
  const sessionTitle =
    reused !== undefined
      ? workspace?.sessions.find((session) => session.id === reused)?.title
      : undefined;
  const branch = workspace?.repoContext?.branch;

  const blockerRef = useRef<HTMLDivElement>(null);
  // A refused start leaves focus on the button that was disabled by it; the alert takes it.
  useEffect(() => {
    if (start.isError) {
      const target = blockerRef.current?.querySelector<HTMLElement>('button') ?? blockerRef.current;
      target?.focus();
    }
  }, [start.isError, start.error]);

  const checkAgain = () => {
    start.reset();
    void check.refetch();
  };

  const submit = () => {
    start.mutate(
      fresh && catalogue.status === 'ready'
        ? {
            provider: choice.providerId,
            model: choice.modelId,
            ...(choice.effort ? { effort: choice.effort } : {}),
          }
        : {},
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} onOpenAutoFocus={focusInitial}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6" aria-busy={check.isPending}>
            {check.isPending ? (
              <p role="status" className="text-body-sm text-content-secondary">
                {t('workflowExecution.agent.checking')}
              </p>
            ) : null}
            {check.isError && !option ? (
              <Alert
                role="alert"
                tone="attention"
                title={t('workflowExecution.agent.checkFailedTitle')}
              >
                <div className="grid gap-2">
                  <p>{t('workflowExecution.agent.checkFailedBody')}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon="refresh"
                      onClick={checkAgain}
                      disabled={check.isFetching}
                    >
                      {t('workflowExecution.agent.checkAgain')}
                    </Button>
                  </div>
                </div>
              </Alert>
            ) : null}
            {blocked ? (
              <div ref={blockerRef} tabIndex={-1} className="outline-none">
                <AgentBlocker
                  option={option}
                  specId={subject.specId}
                  step={step.title || step.id}
                  role={roleName}
                  checking={check.isFetching}
                  onCheckAgain={checkAgain}
                  urgent={refusedOption !== undefined}
                />
              </div>
            ) : null}
            {otherRefusal ? <WorkflowRefusalAlert error={start.error} /> : null}
            {option ? (
              <>
                <InlineNote tone="info" icon={GitCommitHorizontal}>
                  {branch ? (
                    <Trans
                      i18nKey="workflowExecution.agent.commit"
                      values={{ branch }}
                      components={{ code: CODE }}
                    />
                  ) : (
                    t('workflowExecution.agent.commitNoBranch')
                  )}
                </InlineNote>
                <AgentSession
                  mode={mode}
                  independent={independent}
                  step={step.title || step.id}
                  role={roleName ?? t('workflowExecution.agent.roleFallback')}
                  launch={launch}
                  {...(sessionTitle ? { sessionTitle } : {})}
                  catalogue={catalogue}
                  choice={pickerChoice}
                  modelUnassigned={modelUnassigned}
                  workMode={sameAsLaunch ? workModeTitle : undefined}
                  onChoice={choose}
                />
              </>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button data-initial-focus="" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            leadingIcon={Bot}
            onClick={submit}
            disabled={!canStart}
            aria-busy={start.isPending}
          >
            {start.isPending ? copy.submitting : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
