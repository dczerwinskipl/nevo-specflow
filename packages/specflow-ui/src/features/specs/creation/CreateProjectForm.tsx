import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Separator, TextArea, TextInput, Typography } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../api';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useMessage } from '../../../i18n/message';
import { useAnnouncer } from '../../../shared/a11y/useAnnouncer';
import { projectCreationKeys } from './api.project';
import { CreateFailurePanel } from './CreateFailurePanel';
import { CreateFooter } from './CreateFooter';
import { CreateLeaveDialog } from './CreateLeaveDialog';
import { CreateProgressPanel } from './CreateProgressPanel';
import { CreateShell } from './CreateShell';
import { useCreateOperationStorage } from './createOperationStorage';
import {
  createGoalMaxLength,
  createTitleMaxLength,
  projectCreateReadiness,
} from './createProjectReadiness';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateOptions } from './useCreateOptions';
import { useCreateProjectSpecification } from './useCreateProjectSpecification';
import { useRevealFailure } from './useRevealFailure';
import { WorkspacePlaceSection } from './workspace/WorkspacePlaceSection';
import { buildCreateSlug, buildCreateTarget } from './workspace/createRequest';
import { requestChoiceSnapshot } from './workspace/workspaceChoice';
import { useWorkspacePlace } from './workspace/useWorkspacePlace';

/**
 * The Create form of a project Runtime: the specification name, an optional goal and where it
 * lives (new worktree, main workspace or an existing one). The agent session, workflow and initial
 * documents of the demo are not part of the real Create. Each concern has its own owner: the
 * options (`useCreateOptions`), the place choice (`useWorkspacePlace`), the operation itself
 * (`useCreateProjectSpecification`: retained id, watching, check, resume) and what it shows
 * (`CreateProgressPanel`, `CreateFailurePanel`); this component wires them to the form fields.
 */
export function CreateProjectForm({ onCreated }: { onCreated: (created: CreatedSpec) => void }) {
  const { t } = useTranslation();
  const text = useMessage();
  const { projectCreationApi } = useAppServices();
  const storage = useCreateOperationStorage();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const gitHeadingId = useId();
  const { announce, region } = useAnnouncer();

  // An operation the previous page left unconfirmed: the form starts from what was sent.
  const [stored] = useState(() => storage.load());
  const [title, setTitle] = useState(stored?.request.title ?? '');
  const [goal, setGoal] = useState(stored?.request.goal ?? '');

  const createOptions = useCreateOptions({
    queryKey: projectCreationKeys.createOptions,
    fetch: (signal) => projectCreationApi.createOptions(signal),
    isForbidden: (error) => isApiError(error) && error.kind === 'forbidden',
    refetchOnWindowFocus: false,
  });
  const { options: workspaceOptions } = createOptions;
  const place = useWorkspacePlace(createOptions, announce);

  const configurationSnapshot = JSON.stringify({
    title,
    goal,
    choice: requestChoiceSnapshot(place.choice),
  });
  const [initialConfiguration] = useState(configurationSnapshot);

  const { state, flags, actions } = useCreateProjectSpecification({
    stored,
    snapshot: configurationSnapshot,
    onCreated,
    announce,
  });
  const { busy, uncertain, recovery, forbidden: forbiddenCreate } = flags;
  const failure = state.failure;

  const leaveGuard = useCreateLeaveGuard({
    unfinished: flags.unfinished,
    dirty: configurationSnapshot !== initialConfiguration,
    isNavigationAllowed: actions.isNavigationAllowed,
  });
  const reveal = useRevealFailure(state.submitFailed, state.errorSeq, failure);

  const locked = busy || uncertain || recovery || forbiddenCreate || createOptions.forbidden;
  const { prerequisite, canSubmit } = projectCreateReadiness({
    title,
    goal,
    workspaceState: createOptions.state,
    choice: place.choice,
    forbidden: forbiddenCreate || createOptions.forbidden,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const refreshOptions = () =>
    void place.refresh({
      failure,
      dismissFailure: actions.dismissFailure,
      fallbackFocus: () => submitRef.current?.focus(),
    });

  const submission = () => {
    const slug = workspaceOptions
      ? buildCreateSlug(place.choice, workspaceOptions, title)
      : undefined;
    return {
      title,
      goal,
      slug,
      buildTarget: () =>
        workspaceOptions ? buildCreateTarget(place.choice, workspaceOptions, title) : undefined,
      snapshot: configurationSnapshot,
      onFailed: (next: Parameters<typeof place.reportFailure>[0]) =>
        place.reportFailure(next, { slug }),
    };
  };

  const working = busy || state.checking;
  const showPrerequisite = Boolean(prerequisite) && !uncertain && !recovery;
  const submitLabel = working
    ? uncertain || recovery
      ? t('create.submit.checking')
      : t('create.submit.preparing')
    : recovery
      ? t('create.submit.checkOperation')
      : uncertain
        ? t('create.submit.checkResult')
        : t('create.submit.create');
  const note =
    uncertain || recovery ? t('create.footer.operationKept') : t('create.project.footNote');

  return (
    <CreateShell>
      <form
        className="grid gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (recovery) {
            void actions.submit(submission());
            return;
          }
          if (!busy && (uncertain || canSubmit)) {
            reveal.captureSubmit(event);
            void actions.submit(submission());
          }
        }}
      >
        <div className="grid gap-6">
          <ApplicationContextLine className="mb-0" view="new-specification" />
          <header className="grid gap-2">
            <Typography
              as="h1"
              variant="title-lg"
              ref={headingRef}
              tabIndex={-1}
              className="outline-none"
            >
              {t('create.heading.specification')}
            </Typography>
            <Typography as="p" variant="body-md" className="text-content-secondary">
              {t('create.project.subheading')}
            </Typography>
          </header>
        </div>
        <Separator />
        <div className="grid gap-4">
          <Field>
            <Field.Label>{t('create.nameLabel')}</Field.Label>
            <TextInput
              value={title}
              maxLength={createTitleMaxLength}
              disabled={locked}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('create.namePlaceholder')}
            />
          </Field>
          <Field>
            <Field.Label>{t('create.project.goalLabel')}</Field.Label>
            <TextArea
              value={goal}
              maxLength={createGoalMaxLength}
              disabled={locked}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={t('create.project.goalPlaceholder')}
            />
            <Field.Description>{t('create.project.goalHelp')}</Field.Description>
          </Field>
        </div>
        <Separator />
        <WorkspacePlaceSection
          headingId={gitHeadingId}
          state={createOptions.state}
          refreshing={createOptions.fetching && Boolean(workspaceOptions)}
          refreshFailed={createOptions.refreshFailed}
          choice={place.choice}
          update={place.setChoice}
          locked={locked}
          onRefresh={refreshOptions}
          onAnnounce={announce}
          title={title}
          conflicts={place.conflicts}
          handleRef={place.handleRef}
        />
        <Separator />
        <CreateFooter
          actionRegion={reveal.actionRegion}
          submitRef={submitRef}
          failureAlert={
            <>
              <CreateProgressPanel
                operationId={state.sent?.operationId}
                target={state.sent?.target}
                busy={busy}
                monitoring={flags.monitoring}
                concluded={Boolean(failure)}
                onStreamHint={actions.setStreamHint}
              />
              {failure && (
                <CreateFailurePanel
                  failure={failure}
                  state={state}
                  workspaceOptions={workspaceOptions}
                  typedTitle={title.trim()}
                  refreshing={createOptions.fetching}
                  announce={announce}
                  onRefresh={refreshOptions}
                  onUseAutomaticName={() => {
                    place.chooseAutomaticBranch();
                    actions.dismissFailure();
                  }}
                  onUseCustomName={() => {
                    place.chooseCustomBranch();
                    actions.dismissFailure();
                  }}
                />
              )}
            </>
          }
          prerequisite={showPrerequisite && prerequisite ? text(prerequisite) : undefined}
          note={note}
          submitLabel={submitLabel}
          submitDisabled={working || (!uncertain && !recovery && !canSubmit)}
        />
        {region}
      </form>
      <CreateLeaveDialog guard={leaveGuard} />
    </CreateShell>
  );
}
