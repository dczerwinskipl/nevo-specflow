import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator, Typography } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { ApplicationContextLine } from '../../../../app/navigation/ApplicationLocation';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import { CreateShell } from '../CreateShell';
import { CreateFailurePanel } from '../errors/CreateFailurePanel';
import { useRevealFailure } from '../errors/useRevealFailure';
import { CreateConfigurationNotice } from '../form/CreateConfigurationNotice';
import { CreateFooter } from '../form/CreateFooter';
import { CreateFormHeader } from '../form/CreateFormHeader';
import { CreateLeaveDialog } from '../form/CreateLeaveDialog';
import { SessionWorkspaceSummary } from '../form/SessionWorkspaceSummary';
import { useCreateLeaveGuard } from '../form/useCreateLeaveGuard';
import { useCreateDemoSpecification } from '../operation/useCreateDemoSpecification';
import {
  initialAgentChoice,
  providerDefaultEffort,
  selectProvider,
  type AgentChoice,
} from '../options/agentChoice';
import { FirstMessageComposer, type StartEvent } from '../session-start/FirstMessageComposer';
import { ProviderChoice } from '../session-start/ProviderChoice';
import { SessionNameSection } from '../session-start/SessionNameSection';
import {
  chosenSessionName,
  initialSessionName,
  type SessionNameChoice,
} from '../session-start/sessionName';
import { newSessionReadiness } from './newSessionReadiness';
import { PinnedSpecification } from './PinnedSpecification';
import type { SessionStart } from './sessionStart';

export interface NewSessionFormProps {
  catalogue: DemoCatalogue;
  specId: string;
  /** The Session was allocated: open it. `start` is what the user asked it to begin with. */
  onSession: (specId: string, sessionId: string, start: SessionStart) => void;
  onCreated: (id: string, document?: string) => void;
  configurationUnavailable: boolean;
  onRefresh: () => void;
}

/**
 * New Session of an existing Specification: the pinned Specification (read-only), the agent, the
 * first message in the Session Composer (with the first Turn's mode and model · effort), the
 * optional own name and the read-only workspace. Starting allocates the Session through the same
 * operation as Create (`useCreateDemoSpecification` with `specId`) and opens it.
 */
export function NewSessionForm({
  catalogue,
  specId,
  onSession,
  onCreated,
  configurationUnavailable,
  onRefresh,
}: NewSessionFormProps) {
  const { t } = useTranslation();
  const text = useMessage();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const agentHeadingId = useId();
  const { announce, region } = useAnnouncer();
  const [agent, setAgent] = useState<AgentChoice>(() => initialAgentChoice(catalogue));
  const [message, setMessage] = useState('');
  const [name, setName] = useState<SessionNameChoice>(initialSessionName);
  // What the started Session begins with, captured when the user starts it: the operation may
  // settle after further edits, and must open the Session with what was actually submitted.
  const submitted = useRef<SessionStart | null>(null);

  const snapshot = JSON.stringify({ agent, message, name });
  const [initialSnapshot] = useState(snapshot);
  const { state, flags, actions } = useCreateDemoSpecification({
    specId,
    catalogueRevision: catalogue.revision,
    snapshot,
    onCreated,
    onSession: (spec, session) =>
      onSession(spec, session, submitted.current ?? { firstMessage: message.trim() }),
    announce,
  });
  const { busy, uncertain, recovery, forbidden } = flags;
  const failure = state.failure;
  const leaveGuard = useCreateLeaveGuard({
    unfinished: flags.unfinished,
    dirty: snapshot !== initialSnapshot,
    isNavigationAllowed: actions.isNavigationAllowed,
  });
  const reveal = useRevealFailure(state.submitFailed, state.errorSeq, failure);
  const locked = busy || uncertain || recovery || forbidden || configurationUnavailable;
  const { prerequisite, canStart } = newSessionReadiness({
    catalogue,
    agent,
    message,
    name,
    configurationUnavailable,
  });

  const start = (event: StartEvent) => {
    const session = {
      providerId: agent.providerId,
      modelId: agent.modelId,
      ...(agent.effort !== providerDefaultEffort ? { effort: agent.effort } : {}),
      mode: agent.mode,
    };
    // Only the Session is allocated (`specId` is set): the specification part of the submission is
    // never sent, so it carries no values.
    const submission = {
      title: '',
      archetype: { id: '', version: 1, optionalDocumentIds: [] },
      buildTarget: () => undefined,
      session,
      snapshot,
    };
    if (recovery) {
      void actions.submit(submission);

      return;
    }

    if (!busy && (uncertain || canStart)) {
      submitted.current = { firstMessage: message.trim(), name: chosenSessionName(name) };
      reveal.captureSubmit(event);
      void actions.submit(submission);
    }
  };

  const working = busy || state.checking;
  const submitLabel = working
    ? uncertain || recovery
      ? t('create.submit.checking')
      : t('sessionStart.submit.starting')
    : recovery
      ? t('create.submit.checkOperation')
      : uncertain
        ? t('create.submit.checkResult')
        : t('sessionStart.submit.start');
  const note =
    uncertain || recovery
      ? t('create.footer.operationKept')
      : name.mode === 'agent'
        ? t('sessionStart.footer.agentNames')
        : t('sessionStart.footer.ready');
  const showPrerequisite = Boolean(prerequisite) && !uncertain && !recovery;

  const sections: ReactNode[] = [
    <PinnedSpecification key="context" specId={specId} />,
    <fieldset key="agent" disabled={locked} className="grid gap-4">
      <div className="grid gap-1">
        <Typography as="legend" id={agentHeadingId} variant="title-md" className="p-0">
          {t('sessionStart.agent.heading')}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {t('sessionStart.agent.intro')}
        </Typography>
      </div>
      <ProviderChoice
        catalogue={catalogue}
        providerId={agent.providerId}
        labelledBy={agentHeadingId}
        onSelect={(providerId) => setAgent(selectProvider(agent, providerId))}
      />
    </fieldset>,
    <div key="message" className="grid gap-6">
      <FirstMessageComposer
        id={formId}
        catalogue={catalogue}
        choice={agent}
        message={message}
        locked={locked}
        onChoiceChange={setAgent}
        onMessageChange={setMessage}
        onStart={start}
      />
      <SessionNameSection choice={name} locked={locked} onChange={setName} />
    </div>,
    <SessionWorkspaceSummary key="workspace" location={catalogue.currentLocation} />,
  ];

  return (
    <CreateShell
      specId={specId}
      footer={
        <CreateFooter
          formId={formId}
          submitRef={submitRef}
          prerequisite={showPrerequisite && prerequisite ? text(prerequisite) : undefined}
          note={note}
          submitLabel={submitLabel}
          submitDisabled={working || (!uncertain && !recovery && !canStart)}
        />
      }
    >
      <div className="grid gap-8">
        <CreateFormHeader
          headingRef={headingRef}
          lead={<ApplicationContextLine className="mb-0" specId={specId} view="new-session" />}
          heading={t('sessionStart.heading')}
          subheading={t('sessionStart.subheading')}
        />
        {sections.flatMap((section, index) => [
          index > 0 ? <Separator key={`separator-${index}`} /> : null,
          section,
        ])}
        <div ref={reveal.actionRegion} className="grid gap-4 empty:hidden">
          {configurationUnavailable && <CreateConfigurationNotice onRefresh={onRefresh} />}
          {failure && (
            <CreateFailurePanel
              failure={failure}
              state={state}
              workspaceOptions={undefined}
              typedTitle=""
              refreshing={false}
              announce={announce}
              onRefresh={onRefresh}
              // Branch-name remedies belong to Create; a Session allocation never offers them.
              onUseAutomaticName={actions.dismissFailure}
              onUseCustomName={actions.dismissFailure}
            />
          )}
        </div>
        {region}
      </div>
      <CreateLeaveDialog guard={leaveGuard} />
    </CreateShell>
  );
}
