import { useId, useRef, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Typography } from '@nevo/ui';
import { useMessage } from '../../../../i18n/message';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import { selectProvider, type AgentChoice } from '../choice/agentChoice';
import { newSessionReadiness } from '../choice/newSessionReadiness';
import type { SessionNameChoice } from '../choice/sessionName';
import { AgentAvailabilityNote } from '../diagnostics/AgentAvailabilityNote';
import { AgentPicker } from '../fields/AgentPicker';
import { AgentSettings } from '../fields/AgentSettings';
import { SessionNameField } from '../fields/SessionNameField';
import type { SessionStartPending } from '../source/sessionStartSource';
import { ConfigurationNotice } from './ConfigurationNotice';
import { pendingLabel } from './pendingLabel';
import { StartFormActions } from './StartFormActions';

/** `failed`: the last start did not succeed; the choices are kept and the form is unlocked. */
export type SessionStartStatus = 'idle' | 'starting' | 'failed';

/**
 * Where a new Session is started, inside the Session screen's conversation column
 * (full-session.md "Starting a Session"), under the screen's one title (**New session**): the agent
 * picker with the line about the agents that cannot start, the agent's Model, Effort and Work mode
 * as one group, the optional name, then the note and **Start session**. With no agent available
 * the form is only the picker and its message: nothing below it can be chosen.
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
  refreshing = false,
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
  /** The catalogue is being read again. */
  refreshing?: boolean;
  /** Reads the catalogue again: the configuration is unreadable, or an agent may become available. */
  onRefresh?: () => void;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const agentId = useId();
  const availabilityId = useId();
  const noteId = useId();
  const picker = useRef<HTMLDivElement>(null);
  // The chosen agent, else the first one that can be chosen: where focus returns from the details.
  const focusPicker = () =>
    picker.current?.querySelector<HTMLElement>('input:checked:not(:disabled)') ??
    picker.current?.querySelector<HTMLElement>('input:not(:disabled)') ??
    null;
  const working = status === 'starting' || pending?.checking === true;
  const locked = working || pending !== undefined;
  const { prerequisite, canStart } = newSessionReadiness({
    catalogue,
    agent,
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
  const anyUnavailable = catalogue.providers.some((provider) => !provider.available);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!working && (pending || canStart)) {
      onStart();
    }
  };

  return (
    // A container: the agent cards and the settings row take their layout from the form's width.
    <form aria-label={t('sessionStart.form.title')} onSubmit={submit} className="@container">
      <div className="grid gap-6">
        <div className="grid min-w-0 gap-3">
          <fieldset disabled={locked} className="grid min-w-0">
            {/* A rendered `<legend>` takes no part in the fieldset's grid gap: its own margin gives
                the label-to-control spacing of a DS `Field` (`gap-1.5`). */}
            <Typography as="legend" variant="label-md" id={agentId} className="mb-1.5 p-0">
              {t('sessionStart.agent.heading')}
            </Typography>
            <AgentPicker
              catalogue={catalogue}
              providerId={agent.providerId}
              labelledBy={agentId}
              describedBy={anyUnavailable ? availabilityId : undefined}
              groupRef={picker}
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
          {/* Outside the locked fieldset: the diagnostics stay readable while a start is resolved.
              Always mounted: it is the live region that announces what a recheck changed. */}
          <AgentAvailabilityNote
            id={availabilityId}
            catalogue={catalogue}
            refreshing={refreshing}
            onRefresh={onRefresh}
            focusFallback={focusPicker}
          />
        </div>
        {!noAgent && (
          <>
            <AgentSettings
              catalogue={catalogue}
              choice={agent}
              locked={locked}
              onChange={onAgentChange}
            />
            <SessionNameField choice={name} locked={locked} onChange={onNameChange} />
          </>
        )}
        {configurationUnavailable && onRefresh && <ConfigurationNotice onRefresh={onRefresh} />}
        {notice ??
          (status === 'failed' && (
            <Alert tone="danger" role="alert" title={t('sessionStart.form.failedTitle')}>
              {t('sessionStart.form.failedBody')}
            </Alert>
          ))}
        {/* With no agent the message above is the whole answer; a kept request still needs its row. */}
        {(!noAgent || pending) && (
          <StartFormActions
            noteId={noteId}
            note={note}
            label={label}
            disabled={working || (pending === undefined && !canStart)}
            pending={working}
          />
        )}
      </div>
    </form>
  );
}
