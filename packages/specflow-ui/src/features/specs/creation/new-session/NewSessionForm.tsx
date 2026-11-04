import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@nevo/ui';
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
import { useCreateLeaveGuard } from '../form/useCreateLeaveGuard';
import { useCreateDemoSpecification } from '../operation/useCreateDemoSpecification';
import {
  chosenSessionName,
  initialAgentChoice,
  initialSessionName,
  newSessionReadiness,
  providerDefaultEffort,
  SessionNameSection,
  startCatalogueFromDemo,
  type AgentChoice,
  type SessionNameChoice,
} from '../../../sessions';
import { CreateAgentSection } from '../options/CreateAgentSection';
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
 * New Session of an existing Specification: the pinned Specification (read-only), the agent
 * (the same section as Create Specification: executor, work mode and model · effort) and the
 * optional own name. Starting allocates the Session through the same operation as Create
 * (`useCreateDemoSpecification` with `specId`) and opens it idle: the first message is written in
 * the Session's own Composer.
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
  const { announce, region } = useAnnouncer();
  const [agent, setAgent] = useState<AgentChoice>(() =>
    initialAgentChoice(startCatalogueFromDemo(catalogue)),
  );
  const [name, setName] = useState<SessionNameChoice>(initialSessionName);
  // What the started Session is given, captured when the user starts it: the operation may settle
  // after further edits, and must open the Session with what was actually submitted.
  const submitted = useRef<SessionStart | null>(null);

  const snapshot = JSON.stringify({ agent, name });
  const [initialSnapshot] = useState(snapshot);
  const { state, flags, actions } = useCreateDemoSpecification({
    specId,
    catalogueRevision: catalogue.revision,
    snapshot,
    onCreated,
    onSession: (spec, session) => onSession(spec, session, submitted.current ?? {}),
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
    catalogue: startCatalogueFromDemo(catalogue),
    agent,
    name,
    configurationUnavailable,
  });

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      submitted.current = { name: chosenSessionName(name) };
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
    <CreateAgentSection
      key="agent"
      catalogue={catalogue}
      choice={agent}
      locked={locked}
      onChange={setAgent}
      title={t('sessionStart.agent.heading')}
      intro={t('sessionStart.agent.intro')}
    />,
    <SessionNameSection key="name" choice={name} locked={locked} onChange={setName} />,
  ];

  return (
    <CreateShell
      specId={specId}
      form={{ onSubmit: start }}
      footer={
        <CreateFooter
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
