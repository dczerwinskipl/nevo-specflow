import { useId, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Typography } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import { selectProvider, type AgentChoice } from '../choice/agentChoice';
import { newSessionReadiness } from '../choice/newSessionReadiness';
import type { SessionNameChoice } from '../choice/sessionName';
import { AgentFields } from '../fields/AgentFields';
import { ProviderChoice } from '../fields/ProviderChoice';
import { SessionNameSection } from '../fields/SessionNameSection';
import type { SessionStartPending } from '../source/sessionStartSource';
import { ConfigurationNotice } from './ConfigurationNotice';
import { pendingLabel } from './pendingLabel';
import { StartFormActions } from './StartFormActions';

/** `failed`: the last start did not succeed; the choices are kept and the form is unlocked. */
export type SessionStartStatus = 'idle' | 'starting' | 'failed';

/**
 * Where a new Session is started, inside the Session screen's conversation column
 * (full-session.md "Starting a Session"): provider tiles, then the labelled Model, Effort and Work
 * mode fields (`AgentFields`), then the optional own name, then the note and **Start session**.
 * Fully controlled: the owner holds the choice and runs the start, the form only presents it and
 * reports `onStart` once, when the choice is complete (or, while an earlier start is unresolved, to
 * resolve it).
 */
export function SessionStartForm({
  catalogue,
  agent,
  onAgentChange,
  name,
  onNameChange,
  status,
  pending,
  notice,
  configurationUnavailable = false,
  onRefresh,
  onStart,
}: {
  catalogue: StartCatalogue;
  agent: AgentChoice;
  onAgentChange: (agent: AgentChoice) => void;
  name: SessionNameChoice;
  onNameChange: (name: SessionNameChoice) => void;
  status: SessionStartStatus;
  /** An earlier start is unresolved: the form is locked and only resolving it is offered. */
  pending?: SessionStartPending;
  /** Replaces the generic failure alert (a source's own, with its remedies). */
  notice?: ReactNode;
  configurationUnavailable?: boolean;
  /** Reads the catalogue again; offered when the configuration is unreadable or no agent is usable. */
  onRefresh?: () => void;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const titleId = useId();
  const agentId = useId();
  const noteId = useId();
  const working = status === 'starting' || pending?.checking === true;
  const locked = working || pending !== undefined;
  const { prerequisite, canStart } = newSessionReadiness({
    catalogue,
    agent,
    name,
    configurationUnavailable,
  });
  const note = pending
    ? t('create.footer.operationKept')
    : prerequisite
      ? text(prerequisite)
      : name.mode === 'agent'
        ? t('sessionStart.footer.agentNames')
        : t('sessionStart.footer.ready');
  const label =
    status === 'starting'
      ? t('sessionStart.form.starting')
      : pending
        ? pendingLabel(t, pending)
        : t('sessionStart.submit.start');
  const noAgent = !catalogue.providers.some((provider) => provider.available);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!working && (pending || canStart)) {
      onStart();
    }
  };

  return (
    // A container: the provider tiles take their columns from the form's own width.
    <form aria-labelledby={titleId} onSubmit={submit} className="@container">
      <div className="grid gap-6">
        <div className="grid gap-1">
          <Typography as="h2" variant="title-md" id={titleId}>
            {t('sessionStart.form.title')}
          </Typography>
        </div>
        <fieldset disabled={locked} className="grid min-w-0">
          {/* A rendered `<legend>` takes no part in the fieldset's grid gap: its own margin gives the
              label-to-control spacing of a DS `Field` (`gap-1.5`), like Model and Effort below. */}
          <Typography as="legend" variant="label-md" id={agentId} className="mb-1.5 p-0">
            {t('sessionStart.agent.heading')}
          </Typography>
          <ProviderChoice
            catalogue={catalogue}
            providerId={agent.providerId}
            labelledBy={agentId}
            onSelect={(providerId) =>
              onAgentChange(
                selectProvider(
                  agent,
                  catalogue.providers.find((p) => p.id === providerId),
                ),
              )
            }
          />
        </fieldset>
        <AgentFields
          catalogue={catalogue}
          choice={agent}
          locked={locked}
          onChange={onAgentChange}
        />
        <SessionNameSection
          choice={name}
          locked={locked}
          onChange={onNameChange}
          headingLevel="h3"
        />
        {configurationUnavailable && onRefresh && <ConfigurationNotice onRefresh={onRefresh} />}
        {notice ??
          (status === 'failed' && (
            <Alert tone="danger" role="alert" title={t('sessionStart.form.failedTitle')}>
              {t('sessionStart.form.failedBody')}
            </Alert>
          ))}
        <StartFormActions
          noteId={noteId}
          note={note}
          label={label}
          disabled={working || (pending === undefined && !canStart)}
          pending={working}
          onRefresh={noAgent && !pending ? onRefresh : undefined}
        />
      </div>
    </form>
  );
}
