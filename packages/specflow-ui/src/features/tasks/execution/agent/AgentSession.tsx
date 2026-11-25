import { useId, useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Typography, cn } from '@nevo/ui';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import type { AgentLaunch } from '@nevo/specflow-contracts/workflow';
import {
  AgentPicker,
  ModelEffortPicker,
  SessionProviderIcon,
  type StartCatalogue,
} from '../../../sessions';

/** How a fresh Session's agent is shown: the Runtime's catalogue, or why there is none. */
export type AgentCatalogue =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly catalogue: StartCatalogue;
      readonly providers: readonly ProviderDescriptor[];
    };

/** What the owner picked for a fresh Session: the provider, its model and the model's effort. */
export interface FreshChoice {
  readonly providerId: string;
  readonly modelId: string;
  readonly effort?: string;
}

/** The Session the attempt runs in (D18): the workflow decides fresh or continued, not the dialog. */
export type SessionMode = 'fresh' | 'reuse' | 'gone' | 'not-chosen';

/** A link to the Session where a router exists (the dialog is also shown without one). */
export function SessionLink({
  sessionId,
  title,
  className,
}: {
  readonly sessionId: string;
  readonly title: string;
  /** Layout of the link in its line (a history action keeps its 24px target). */
  readonly className?: string;
}) {
  const router = useRouter({ warn: false });
  if (!router) {
    return <span className={cn('text-content-primary', className)}>{title}</span>;
  }

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId }}
      search={{ collection: 'current' }}
      className={cn('text-content-link underline-offset-2 hover:underline', className)}
    >
      {title}
    </Link>
  );
}

function ContinuedSession({
  gone,
  launch,
  sessionTitle,
  catalogue,
}: {
  readonly gone: boolean;
  readonly launch: AgentLaunch | undefined;
  readonly sessionTitle: string | undefined;
  readonly catalogue: AgentCatalogue;
}) {
  const { t } = useTranslation();
  const sessionId = launch?.session.mode === 'reuse' ? launch.session.sessionId : undefined;
  const title = sessionTitle ?? t('workflowExecution.agent.session.earlier');
  const provider =
    catalogue.status === 'ready'
      ? catalogue.providers.find((candidate) => candidate.providerId === launch?.provider)
      : undefined;
  const model =
    provider?.models.find((candidate) => candidate.modelId === launch?.model)?.title ??
    launch?.model;
  const modelLine = [model, launch?.effort].filter(Boolean).join(' · ');

  return (
    <div className="grid gap-2">
      <Typography as="p" variant="label-sm">
        {t('workflowExecution.agent.session.label')}
      </Typography>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-md">
        <SessionProviderIcon providerId={launch?.provider} />
        <span className="text-content-primary">
          {t('workflowExecution.agent.session.continues')}
        </span>
        {gone || !sessionId ? (
          <span className="text-content-muted line-through">{title}</span>
        ) : (
          <SessionLink sessionId={sessionId} title={title} />
        )}
      </p>
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {gone
          ? t('workflowExecution.agent.session.gone')
          : t('workflowExecution.agent.session.continuesWhy', { model: modelLine })}
      </Typography>
    </div>
  );
}

/**
 * The Session section of the dialog: a new Session (the start screen's agent tiles and the
 * Composer's model picker, preselected from the agent role's settings), the one the workflow
 * continues (read-only), or that no agent and model are chosen yet. An independent step says why it
 * always starts a new Session.
 */
export function AgentSession({
  mode,
  independent,
  step,
  role,
  launch,
  sessionTitle,
  catalogue,
  choice,
  modelUnassigned = false,
  workMode,
  onChoice,
}: {
  readonly mode: SessionMode;
  readonly independent: boolean;
  readonly step: string;
  readonly role: string;
  readonly launch: AgentLaunch | undefined;
  readonly sessionTitle?: string;
  readonly catalogue: AgentCatalogue;
  readonly choice: FreshChoice;
  /**
   * The role's settings name no model the chosen provider offers: the picker asks for one ("Choose a
   * model") and says why; the configured id is never shown.
   */
  readonly modelUnassigned?: boolean;
  /** The work mode a new Session of this choice runs in (the Runtime's `workMode` title). */
  readonly workMode?: string | undefined;
  readonly onChoice: (choice: FreshChoice) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  /** The owner picked the agent or model in this dialog: the choice is no longer the settings'. */
  const [ownChoice, setOwnChoice] = useState(false);
  if (mode === 'reuse' || mode === 'gone') {
    return (
      <ContinuedSession
        gone={mode === 'gone'}
        launch={launch}
        sessionTitle={sessionTitle}
        catalogue={catalogue}
      />
    );
  }

  const ready = catalogue.status === 'ready' ? catalogue : undefined;
  const provider = ready?.providers.find((candidate) => candidate.providerId === choice.providerId);
  const agentLine = [launch?.provider, launch?.model].filter(Boolean).join(' · ');

  return (
    <div className="grid gap-3">
      <Typography as="p" variant="label-sm" id={labelId}>
        {t('workflowExecution.agent.session.newSession')}
      </Typography>
      {mode === 'not-chosen' ? (
        <p className="flex items-center gap-2 text-body-md text-content-muted">
          <span className="inline-flex size-4 rounded-full border border-dashed border-border-strong" />
          {t('workflowExecution.agent.session.notChosen')}
        </p>
      ) : (
        <>
          {ready ? (
            <>
              <AgentPicker
                catalogue={ready.catalogue}
                providerId={choice.providerId}
                labelledBy={labelId}
                onSelect={(providerId) => {
                  setOwnChoice(true);
                  const next = ready.providers.find(
                    (candidate) => candidate.providerId === providerId,
                  );
                  onChoice({ providerId, modelId: next?.models[0]?.modelId ?? '' });
                }}
              />
              {provider ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Typography as="span" variant="body-sm" className="text-content-secondary">
                      {t('workflowExecution.agent.session.model')}
                    </Typography>
                    <ModelEffortPicker
                      provider={provider}
                      {...(modelUnassigned
                        ? { placeholder: t('workflowExecution.agent.session.chooseModel') }
                        : {})}
                      value={{
                        modelId: choice.modelId,
                        ...(choice.effort ? { effort: choice.effort } : {}),
                      }}
                      onChange={(modelId, effort) => {
                        setOwnChoice(true);
                        // Picking a model keeps the effort chosen so far (the agent settings') when
                        // the model offers it; otherwise none, so the provider's own default runs,
                        // never the first effort of the list. Picking an effort sets it.
                        const offered =
                          provider.models.find((model) => model.modelId === modelId)?.efforts ?? [];
                        const kept =
                          modelId === choice.modelId
                            ? effort
                            : choice.effort !== undefined && offered.includes(choice.effort)
                              ? choice.effort
                              : undefined;
                        onChoice({
                          providerId: choice.providerId,
                          modelId,
                          ...(kept ? { effort: kept } : {}),
                        });
                      }}
                    />
                  </div>
                  {workMode ? (
                    // Information, not a setting: the Runtime decides the mode for this launch, so
                    // it is a sentence, never a label and value that read like a disabled picker.
                    <Typography as="p" variant="body-sm" className="text-content-secondary">
                      {t('workflowExecution.agent.session.workMode', { mode: workMode })}
                    </Typography>
                  ) : null}
                </>
              ) : null}
            </>
          ) : catalogue.status === 'loading' ? (
            <Typography as="p" variant="body-sm" className="text-content-secondary" role="status">
              {t('workflowExecution.agent.session.loadingAgents')}
            </Typography>
          ) : (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('workflowExecution.agent.session.catalogueFailed', { agent: agentLine, role })}
            </Typography>
          )}
          {modelUnassigned && provider ? (
            <Typography as="p" variant="body-sm" className="text-content-primary" role="status">
              {t('workflowExecution.agent.session.modelUnassigned', {
                role,
                provider: provider.title,
              })}
            </Typography>
          ) : null}
          {/* "Preselected from the … settings" only while the choice is still the settings' one:
              once the owner picks the agent or model, it is theirs. */}
          {(ready && !modelUnassigned && !ownChoice) || independent ? (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {independent
                ? t(
                    ownChoice
                      ? 'workflowExecution.agent.session.independentOwn'
                      : 'workflowExecution.agent.session.independent',
                    { step, role },
                  )
                : t('workflowExecution.agent.session.preselected', { role })}
            </Typography>
          ) : null}
        </>
      )}
    </div>
  );
}
