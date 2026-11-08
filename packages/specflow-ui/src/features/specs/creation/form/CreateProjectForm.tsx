import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Alert, Field, Separator, TextArea, TextInput, cn } from '@nevo/ui';
import { isApiError } from '../../../../api';
import { ApplicationContextLine } from '../../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../../app/useAppServices';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import type { RequestAttempt } from '../../../../shared/operations/retainedRequest';
import { projectCreationKeys } from '../api/api.project';
import { documentCatalogueKeys } from '../../../documents/read-model';
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
import { ArchetypeSection, type ArchetypeCatalogueState } from '../options/ArchetypeSection';
import {
  archetypeSelection,
  documentsToCreate,
  initialArchetypeChoice,
  refreshedArchetypeChoice,
  selectedArchetype,
  type ArchetypeChoice,
} from '../options/archetypeChoice';
import { CreateWorkspaceSection } from './CreateWorkspaceSection';
import {
  createControlWidth,
  createFormColumn,
  createFormColumns,
  createFormWidth,
} from '../createFormLayout';
import { firstChoiceControl } from './createGuide';
import { revealControl, useCreateGuide } from './useCreateGuide';
import { buildCreateFacts } from '../workspace/model/createFacts';
import {
  buildCreateSlug,
  buildCreateTarget,
  requestChoiceSnapshot,
} from '../workspace/model/createRequest';
import type { WorkspaceChoice } from '../workspace/model/workspaceChoice';
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
  // Back to form after the archetypes changed: the choice is kept (if it still exists) with the
  // new default ticks; after an unknown archetype the default archetype is selected.
  const [archetypeChoice, setArchetypeChoice] = useState<ArchetypeChoice>(() => {
    const restored = draft?.archetype ?? initialArchetypeChoice;

    return draft?.failure?.kind === 'catalogue-stale'
      ? refreshedArchetypeChoice(restored, draft.failure.code)
      : restored;
  });
  // The catalogue is read on every visit: Create checks its revision.
  const archetypes = useQuery({
    // One cache entry with the documents feature (same route): a refresh here refreshes both.
    queryKey: documentCatalogueKeys.catalogue('project'),
    queryFn: ({ signal }) => projectCreationApi.archetypes(signal),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const catalogue = archetypes.data;
  const archetype = selectedArchetype(catalogue, archetypeChoice);
  const archetypeState: ArchetypeCatalogueState = catalogue
    ? { status: 'ready', catalogue }
    : archetypes.isError
      ? { status: 'error', retry: () => void archetypes.refetch() }
      : { status: 'loading' };

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

  // What an edit is measured against. The fields are taken on the first render; the place choice
  // only once the options are there, because only then can a restored draft's overrides be read
  // (before that, its snapshot has none, and the arriving options would look like an edit).
  const fieldsSnapshot = JSON.stringify({ title, goal, archetype: archetypeChoice });
  const choiceSnapshot = JSON.stringify(
    requestChoiceSnapshot(place.choice, workspaceOptions, title),
  );
  const [initialFields] = useState(fieldsSnapshot);
  const [initialChoice, setInitialChoice] = useState(() =>
    workspaceOptions ? choiceSnapshot : undefined,
  );
  if (initialChoice === undefined && workspaceOptions) {
    setInitialChoice(choiceSnapshot);
  }

  const edited =
    fieldsSnapshot !== initialFields ||
    (initialChoice !== undefined && choiceSnapshot !== initialChoice);

  // The draft is consumed by the first render: a reload of the form starts clean again.
  useEffect(() => {
    if (draft) {
      storage.clearDraft(draft.operationId);
    }
  }, [draft, storage]);

  // Only unsaved edits ask before leaving; an operation outlives this screen (it has its page).
  const leaveGuard = useCreateLeaveGuard({
    unfinished: false,
    dirty: edited,
    isNavigationAllowed: () => started.current,
  });

  const locked = createOptions.forbidden;
  const { prerequisite, problemField, canSubmit } = projectCreateReadiness({
    title,
    goal,
    workspaceState: createOptions.state,
    choice: place.choice,
    forbidden: createOptions.forbidden,
    archetypesLoading: archetypes.isPending,
    archetypesFailed: archetypes.isError && !catalogue,
    archetype,
    noArchetypes: catalogue?.archetypes.length === 0,
  });

  // Back from a name the Engine refused (invalid or too long path): the name says so until edited.
  const [nameRefused, setNameRefused] = useState(draft?.failure?.kind === 'name-invalid');
  const nameRef = useRef<HTMLInputElement>(null);
  const archetypeRef = useRef<HTMLDivElement>(null);
  const reason = prerequisite ? text(prerequisite) : undefined;
  const { tried, guide } = useCreateGuide({
    problemField,
    reason,
    announce,
    focusField: (field) => {
      if (field === 'name') {
        revealControl(nameRef.current);
      } else if (field === 'archetype') {
        revealControl(firstChoiceControl(archetypeRef.current));
      } else if (
        field !== 'provider' &&
        field !== 'model' &&
        field !== 'effort' &&
        field !== 'mode'
      ) {
        place.handleRef.current?.focusProblem(field);
      }
    },
  });
  // An empty name says so at the field once the owner typed and left it empty, or once Create was
  // tried; passing through the empty field says nothing.
  const nameEdited = useRef(false);
  const [nameLeft, setNameLeft] = useState(false);
  const nameMissing = !title.trim() && (tried || nameLeft);
  useEffect(() => {
    if (nameRefused) {
      nameRef.current?.focus();
    } else {
      headingRef.current?.focus();
    }
    // Once, on arrival: the refusal decides where focus starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!canSubmit || started.current || !catalogue || !archetype) {
      return;
    }

    const slug = workspaceOptions
      ? buildCreateSlug(place.choice, workspaceOptions, title)
      : undefined;
    const request = startCreate({
      attempt,
      storage,
      draft: {
        title,
        goal,
        choice: place.choice,
        archetype: archetypeChoice,
        archetypeTitle: archetype.title,
        documentFiles: documentsToCreate(archetype, archetypeChoice),
        ...factsOf(place.choice),
      },
      selection: archetypeSelection(catalogue, archetype, archetypeChoice),
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
    <CreateShell
      columns
      form={{
        onSubmit: (event) => {
          event.preventDefault();
          if (!canSubmit) {
            // Blocked by the form's values (a click, Enter or Space on Create, Enter in a field):
            // nothing is prepared or sent; lead to the first faulty field instead.
            if (!locked) {
              guide();
            }

            return;
          }

          submit();
        },
      }}
      footer={
        <CreateFooter
          submitRef={submitRef}
          prerequisite={reason}
          note={t('create.project.footNote')}
          submitLabel={t('create.submit.create')}
          submitDisabled={locked}
          submitBlocked={!canSubmit}
          onGuide={problemField && !locked ? guide : undefined}
        />
      }
    >
      <div className={cn('grid gap-8', createFormWidth)}>
        <CreateFormHeader
          headingRef={headingRef}
          lead={<ApplicationContextLine className="mb-0" view="new-specification" />}
          heading={t('create.heading.specification')}
          subheading={t('create.subheading.withArchetype')}
        />
        <Separator />
        {/* What is created (left), then where (right): DOM order is the reading and Tab order. */}
        <div className={createFormColumns}>
          <div className={createFormColumn}>
            <div className="grid gap-4">
              <Field invalid={nameRefused || nameMissing} className={createControlWidth}>
                <Field.Label>{t('create.nameLabel')}</Field.Label>
                <TextInput
                  ref={nameRef}
                  value={title}
                  maxLength={createTitleMaxLength}
                  disabled={locked}
                  onChange={(event) => {
                    setUnprepared(false);
                    setNameRefused(false);
                    nameEdited.current = true;
                    setTitle(event.target.value);
                  }}
                  onBlur={() => setNameLeft(nameEdited.current)}
                  placeholder={t('create.namePlaceholder')}
                />
                {nameRefused ? (
                  <Field.Error>{t('create.errors.nameInvalid.field')}</Field.Error>
                ) : nameMissing ? (
                  <Field.Error>{t('create.prerequisite.title')}</Field.Error>
                ) : null}
              </Field>
              <Field className={createControlWidth}>
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
            <div ref={archetypeRef} className="min-w-0">
              <ArchetypeSection
                state={archetypeState}
                choice={archetypeChoice}
                locked={locked}
                onChange={setArchetypeChoice}
                error={
                  tried && catalogue && !archetype ? t('create.prerequisite.archetype') : undefined
                }
              />
            </div>
          </div>
          {/* Between the stacked columns only: side by side, the gap separates them. */}
          <Separator className="@min-[62rem]:hidden" />
          <div className={createFormColumn}>
            <CreateWorkspaceSection
              headingId={gitHeadingId}
              createOptions={createOptions}
              place={place}
              locked={locked}
              title={title}
              onRefresh={refreshOptions}
              onAnnounce={announce}
              showRequired={tried}
            />
          </div>
        </div>
        {unprepared && (
          <Alert
            role="alert"
            tone="attention"
            title={t('create.errors.failed.title')}
            className="max-w-content-form"
          >
            <p>{t('create.errors.failed.body')}</p>
          </Alert>
        )}
        {region}
      </div>
      <CreateLeaveDialog guard={leaveGuard} />
    </CreateShell>
  );
}
