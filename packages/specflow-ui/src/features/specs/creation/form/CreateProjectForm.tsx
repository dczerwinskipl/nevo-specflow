import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Field, Separator, TextArea, TextInput } from '@nevo/ui';
import { isApiError } from '../../../../api';
import { ApplicationContextLine } from '../../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../../app/useAppServices';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import type { RequestAttempt } from '../../../../shared/operations/retainedRequest';
import { projectCreationKeys } from '../api/api.project';
import { CreateFooter } from './CreateFooter';
import { CreateFormHeader } from './CreateFormHeader';
import { CreateLeaveDialog } from './CreateLeaveDialog';
import { CreateShell } from '../CreateShell';
import {
  useCreateOperationStorage,
  type SentCreateRequest,
} from '../operation/createOperationStorage';
import {
  createGoalMaxLength,
  createTitleMaxLength,
  projectCreateReadiness,
} from './createProjectReadiness';
import { startCreate } from '../operation/startCreate';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateOptions } from '../options/useCreateOptions';
import { CreateWorkspaceSection } from './CreateWorkspaceSection';
import { buildCreateFacts } from '../workspace/model/createFacts';
import { buildCreateSlug, buildCreateTarget } from '../workspace/model/createRequest';
import { requestChoiceSnapshot, type WorkspaceChoice } from '../workspace/model/workspaceChoice';
import { useWorkspacePlace } from '../workspace/useWorkspacePlace';

/**
 * The Create form of a project Runtime: the specification name, an optional goal and where it
 * lives (new worktree, main workspace or an existing one). Submitting only prepares the request
 * (`startCreate`: retained operation id, stored request and draft) and hands over to the progress
 * page, which sends, watches and reports it. Each concern has its own owner: the options
 * (`useCreateOptions`), the place choice (`useWorkspacePlace`) and the operation (the page); this
 * component wires the first two to the form fields.
 *
 * Opening Create always shows an empty form, whatever the ledger holds: an unfinished operation is
 * reached from the operations list or its own page, never by this entry. Only the explicit "Back to
 * form" of an operation's page (`restoreDraftOf`) seeds the fields, once, from that operation's draft.
 */
export function CreateProjectForm({
  onStarted,
  restoreDraftOf,
}: {
  /** The request is stored: continue on the page of this operation. */
  onStarted: (operationId: string) => void;
  /** The operation whose draft to restore ("Back to form"); absent for a plain entry. */
  restoreDraftOf?: string;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const { projectCreationApi } = useAppServices();
  const storage = useCreateOperationStorage();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const gitHeadingId = useId();
  const attempt = useRef<RequestAttempt<SentCreateRequest> | null>(null);
  const started = useRef(false);
  const { announce, region } = useAnnouncer();
  const [unprepared, setUnprepared] = useState(false);

  const [draft] = useState(() => (restoreDraftOf ? storage.loadDraft(restoreDraftOf) : undefined));
  const [title, setTitle] = useState(draft?.title ?? '');
  const [goal, setGoal] = useState(draft?.goal ?? '');

  const createOptions = useCreateOptions({
    queryKey: projectCreationKeys.createOptions,
    fetch: (signal) => projectCreationApi.createOptions(signal),
    isForbidden: (error) => isApiError(error) && error.kind === 'forbidden',
    refetchOnWindowFocus: false,
  });
  const { options: workspaceOptions } = createOptions;
  const place = useWorkspacePlace(
    createOptions,
    announce,
    draft && { choice: draft.choice, failure: draft.failure },
  );

  const configurationSnapshot = JSON.stringify({
    title,
    goal,
    choice: requestChoiceSnapshot(place.choice),
  });
  const [initialConfiguration] = useState(configurationSnapshot);

  // The draft is consumed by the first render: a reload of the form starts clean again.
  useEffect(() => {
    if (draft) storage.clearDraft(draft.operationId);
  }, [draft, storage]);

  // Only unsaved edits ask before leaving; an operation outlives this screen (it has its page).
  const leaveGuard = useCreateLeaveGuard({
    unfinished: false,
    dirty: configurationSnapshot !== initialConfiguration,
    isNavigationAllowed: () => started.current,
  });

  const locked = createOptions.forbidden;
  const { prerequisite, canSubmit } = projectCreateReadiness({
    title,
    goal,
    workspaceState: createOptions.state,
    choice: place.choice,
    forbidden: createOptions.forbidden,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const refreshOptions = () =>
    void place.refresh({
      failure: null,
      dismissFailure: () => undefined,
      fallbackFocus: () => submitRef.current?.focus(),
    });

  /** What the form says this Create does, so the progress page can state it without guessing. */
  const factsOf = (choice: WorkspaceChoice) => {
    const facts = workspaceOptions && buildCreateFacts(choice, workspaceOptions, title);
    return facts ? { facts } : {};
  };

  const submit = () => {
    if (!canSubmit || started.current) return;
    const slug = workspaceOptions
      ? buildCreateSlug(place.choice, workspaceOptions, title)
      : undefined;
    const request = startCreate({
      attempt,
      storage,
      draft: { title, goal, choice: place.choice, ...factsOf(place.choice) },
      slug,
      buildTarget: () =>
        workspaceOptions ? buildCreateTarget(place.choice, workspaceOptions, title) : undefined,
    });
    if (!request) {
      // Nothing was stored or sent: the form stays usable.
      setUnprepared(true);
      announce(t('create.errors.failed.title'));
      return;
    }
    started.current = true;
    onStarted(request.operationId);
  };

  return (
    <CreateShell>
      <form
        className="grid gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <CreateFormHeader
          headingRef={headingRef}
          lead={<ApplicationContextLine className="mb-0" view="new-specification" />}
          heading={t('create.heading.specification')}
          subheading={t('create.project.subheading')}
        />
        <Separator />
        <div className="grid gap-4">
          <Field>
            <Field.Label>{t('create.nameLabel')}</Field.Label>
            <TextInput
              value={title}
              maxLength={createTitleMaxLength}
              disabled={locked}
              onChange={(event) => {
                setUnprepared(false);
                setTitle(event.target.value);
              }}
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
        <CreateWorkspaceSection
          headingId={gitHeadingId}
          createOptions={createOptions}
          place={place}
          locked={locked}
          title={title}
          onRefresh={refreshOptions}
          onAnnounce={announce}
        />
        <Separator />
        <CreateFooter
          submitRef={submitRef}
          failureAlert={
            unprepared && (
              <Alert role="alert" tone="attention" title={t('create.errors.failed.title')}>
                <p>{t('create.errors.failed.body')}</p>
              </Alert>
            )
          }
          prerequisite={prerequisite ? text(prerequisite) : undefined}
          note={t('create.project.footNote')}
          submitLabel={t('create.submit.create')}
          submitDisabled={locked || !canSubmit}
        />
        {region}
      </form>
      <CreateLeaveDialog guard={leaveGuard} />
    </CreateShell>
  );
}
