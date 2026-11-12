import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  InlineNote,
  ItemTabs,
  TextArea,
  TextInput,
  Typography,
  WorkspaceHeader,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import type { SaveInput, SaveResult } from '@nevo/specflow-contracts/documents';
import {
  documentContentFixture,
  saveResultFixture,
} from '../../../test-support/documents/fixtures';
import { TestServicesRouterContext } from '../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../app/VisitStateProvider';
import { DocumentEditor } from '../../features/documents/editor/DocumentEditor';
import {
  DocumentEditorProvider,
  useDocumentEditor,
} from '../../features/documents/editor/DocumentEditorProvider';
import { documentHeaderModel } from '../../features/documents/editor/documentHeaderModel';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../services';
import { MockNavigation } from '../editor-mode/MockNavigation.stories-support';
import {
  backendHistory,
  reviewFailed,
  specification,
  task,
  taskDocument,
  taskTypes,
  typeOf,
  type MockTask,
  type WorkflowView,
} from './fixtures.stories-support';
import {
  AddContextDialog,
  AddDependencyDialog,
  TaskContextSection,
  TaskDependenciesSection,
  TaskDocumentsSection,
  draftContext,
  type ContextEntry,
} from './TaskAuthoring.stories-support';
import {
  FinishStepDialog,
  ReturnStepDialog,
  StartTaskDialog,
  WorkflowHistory,
  WorkflowPanel,
} from './WorkflowPanel.stories-support';

/*
 * PRESENTATION MOCK ONLY (docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md).
 * Full Task at /specs/:specId/tasks/:taskId. task.md is edited in the REAL Documents editor
 * (DocumentEditorProvider + DocumentEditor) with a stubbed save; everything else is fixtures.
 */

export type TaskScenario =
  | 'draft'
  | 'first-start'
  | 'start-definition-changed'
  | 'start-type-not-allowed'
  | 'start-changed-since-preview'
  | 'waiting'
  | 'rework'
  | 'finish-review-failed'
  | 'finish-feedback-missing'
  | 'return'
  | 'on-hold'
  | 'cancelled'
  | 'done'
  | 'edit-details'
  | 'edit-conflict'
  | 'edit-document'
  | 'author'
  | 'author-add-menu'
  | 'author-add-spec-doc'
  | 'author-add-project-doc'
  | 'author-add-path'
  | 'author-row-menu'
  | 'author-dependencies'
  | 'author-with-document'
  | 'approve-missing-context'
  | 'long-title';

export interface TaskMockProps {
  width: number;
  height?: number;
  scenario: TaskScenario;
  /** Task history Secondary: closed by default, opened with the header history toggle. */
  historyOpen?: boolean;
  /** A/B for editing task.md: the document as a Secondary tab (A) or as the Primary (B). */
  documentPlacement?: 'secondary' | 'primary';
}

const noop = () => undefined;

const reviewView: WorkflowView = {
  definition: task('T-02').workflow.definition,
  position: { kind: 'active', step: 'review', attempt: 1, since: '11:05', actor: 'Dominik' },
  transitions: [
    { id: 'approved', label: 'Approved', to: null, feedback: 'optional' },
    { id: 'changes-requested', label: 'Changes requested', to: 'implement', feedback: 'required' },
  ],
  returnSteps: ['spike', 'implement'],
  latest: {
    fromStep: 'implement',
    attempt: 1,
    result: 'Ready for review',
    toStep: 'review',
    feedback: 'Endpoint, cookie and refresh are in place.',
    actor: 'Dominik',
    at: 'Today 10:15',
  },
};

function subjectFor(scenario: TaskScenario): MockTask {
  if (scenario.startsWith('author') || scenario === 'approve-missing-context') {
    return task('T-04');
  }

  if (scenario === 'long-title') {
    return {
      ...task('T-02'),
      title:
        'Exchange the identity provider authorization code for a SpecFlow session, set the HTTP-only cookie and refresh it before it expires without losing the return URL',
    };
  }

  switch (scenario) {
    case 'draft':
      return task('T-04');
    case 'first-start':
    case 'start-definition-changed':
    case 'start-changed-since-preview':
      return task('T-07');
    case 'start-type-not-allowed':
      // A not-started Spike Task whose type the archetype no longer allows.
      return {
        ...task('T-07'),
        id: 'T-08',
        title: 'Compare refresh strategies',
        summary: 'Measure sliding against fixed refresh before choosing one.',
        type: 'spike',
        workflow: {
          definition: taskTypes[0]!.workflow,
          position: { kind: 'not-started', firstStep: 'spike' },
          canStart: true,
        },
      };
    case 'waiting':
      return task('T-03');
    case 'on-hold':
      return task('T-05');
    case 'cancelled':
      return task('T-06');
    case 'done':
      return task('T-01');
    case 'finish-review-failed':
    case 'finish-feedback-missing':
      return { ...task('T-02'), workflow: reviewView };
    default:
      return task('T-02');
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Lifecycle                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Header actions: only what the Task lifecycle allows now. Workflow actions live in the panel. */
function lifecycleActions(item: MockTask): WorkspaceHeaderAction[] {
  const terminal = item.workflow.position.kind === 'terminal';
  const active = item.workflow.position.kind === 'active';
  if (item.status === 'cancelled' || terminal) {
    return [];
  }

  const edit = { id: 'edit', label: 'Edit details', icon: 'edit', onPress: noop } as const;
  const hold = { id: 'hold', label: 'Put on hold', onPress: noop } as const;
  // Hold is not allowed while an attempt runs; the reason is the label so it is not a dead end.
  const holdUnavailable = {
    id: 'hold',
    label: 'Put on hold — finish or return the current step first',
    disabled: true,
    onPress: noop,
  } as const;
  const cancel = { id: 'cancel', label: 'Cancel task', tone: 'danger', onPress: noop } as const;
  const remove = { id: 'remove', label: 'Remove task', tone: 'danger', onPress: noop } as const;
  const neverStarted = !item.started;
  switch (item.status) {
    case 'draft':
      return [edit, hold, cancel, remove];
    case 'on-hold':
      return [edit, cancel, ...(neverStarted ? [remove] : [])];
    default:
      return [edit, active ? holdUnavailable : hold, cancel, ...(neverStarted ? [remove] : [])];
  }
}

function PreparationNotice({ item }: { item: MockTask }) {
  switch (item.status) {
    case 'draft':
      return (
        <InlineNote tone="attention">
          <span className="font-medium text-content-primary">Draft</span> · needs approval before it
          can start
        </InlineNote>
      );
    case 'on-hold':
      return (
        <span className="text-body-sm text-content-secondary">
          On hold since yesterday · Dominik: “Waiting for the security review slot.”
        </span>
      );
    case 'cancelled':
      return (
        <span className="text-body-sm text-content-secondary">
          Cancelled yesterday by Dominik · “Out of scope after the provider decision.” It does not
          block closing the specification.
        </span>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Details dialog                                                                                */
/* ------------------------------------------------------------------------------------------ */

function EditDetailsDialog({ item, conflict }: { item: MockTask; conflict: boolean }) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {item.id}</DialogTitle>
          <DialogDescription>
            Title and summary. Content, context and dependencies are edited on the task page.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {conflict ? (
            <Alert
              role="alert"
              tone="danger"
              title={`Not saved: ${item.id} changed since you opened it`}
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Copy my changes
                  </Button>
                  <Button size="sm" variant="secondary">
                    Load the latest version
                  </Button>
                </>
              }
            >
              Dominik changed the summary a minute ago. Your edits are still in the form.
            </Alert>
          ) : null}
          <Field>
            <Field.Label>Title</Field.Label>
            <TextInput defaultValue={item.title} />
          </Field>
          <Field>
            <Field.Label>Summary</Field.Label>
            <TextArea rows={2} defaultValue={`${item.summary} Include the expiry case.`} />
          </Field>
          <div className="grid gap-1">
            <Typography as="p" variant="label-sm">
              Task type
            </Typography>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {typeOf(item).title}. A task keeps the type it was created with; to use another type,
              remove this task and create a new one.
            </Typography>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button disabled={conflict}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* task.md through the real Documents editor                                                     */
/* ------------------------------------------------------------------------------------------ */

const draftTaskDocument = `# Return users to where they were

## Goal

After a successful sign-in, restore the project, document and scroll position the user had open.

## Acceptance

- The previous route is kept in the sign-in state and restored after the callback.
- Scroll position and open document tab are restored.
- A deep link opened while signed out lands on that link after sign-in.
`;

function recordFor(id: string) {
  return documentContentFixture({
    id: `tasks/${id}/task`,
    title: id,
    path: `tasks/${id}/task.md`,
    content: id === 'T-02' ? taskDocument : draftTaskDocument,
    revision: '3',
    // No type caption: the Task document is identified by its Task, not by a document type.
    type: undefined,
  });
}

function DocumentServices({ taskId, children }: { taskId: string; children: ReactNode }) {
  const taskDocumentRecord = useMemo(() => recordFor(taskId), [taskId]);
  const client = useMemo(() => new QueryClient(), []);
  const services = useMemo(() => {
    const base = createSpecFlowAppServices();

    return {
      ...base,
      demoDocumentsApi: {
        ...base.demoDocumentsApi,
        save: (_spec: string, _document: string, _input: SaveInput) =>
          Promise.resolve<SaveResult>(saveResultFixture('4')),
      },
    };
  }, []);

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <DocumentEditorProvider specId={specification.id} document={taskDocumentRecord}>
            {children}
          </DocumentEditorProvider>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

function TaskDocumentHeader({
  back,
  taskId,
  more,
}: {
  back?: boolean;
  taskId: string;
  more?: boolean;
}) {
  const { actions, dirty } = documentHeaderModel(useDocumentEditor(), useTranslation().t);
  if (!back) {
    // A: the same editor-tab rail as the Documents page (one tab, its actions continue the rail).
    return (
      <WorkspaceHeader
        tabRail
        headingLevel={2}
        title="task.md"
        actions={actions}
        menu="complete"
        labels={{ moreActions: 'More actions', menuActions: 'Actions', menuDisplay: 'Display' }}
        identityContent={
          // As DocumentTabStrip: the strip fills the rail so the tab gets its measured width.
          <div className="flex min-w-0 items-stretch">
            <div className="min-w-0 flex-1">
              <ItemTabs
                items={[
                  {
                    id: `tasks/${taskId}/task`,
                    label: 'task.md',
                    description: `tasks/${taskId}/task.md`,
                    ...(dirty ? { dirty: true } : {}),
                  },
                  ...(more
                    ? [
                        {
                          id: `tasks/${taskId}/screens`,
                          label: 'screens.md',
                          description: `tasks/${taskId}/screens.md`,
                        },
                      ]
                    : []),
                ]}
                activeId={`tasks/${taskId}/task`}
                onActivate={noop}
                onClose={noop}
                scope="workflow-manual-task-doc"
                density="rail"
                labels={{
                  tablist: 'Open documents',
                  openedMenu: (n: number) => `Opened (${n})`,
                  switcher: ({ label, count }: { label: string; count: number }) =>
                    `${label} (${count})`,
                }}
              />
            </div>
          </div>
        }
      />
    );
  }

  return (
    <WorkspaceHeader
      title={back ? `${taskId} · task.md` : 'task.md'}
      icon="file"
      headingLevel={2}
      actions={[
        ...actions,
        ...(back ? [{ id: 'back', label: 'Back to task', onPress: noop } as const] : []),
      ]}
      menu="complete"
      labels={{ moreActions: 'More actions' }}
      status={dirty ? <span role="status">•</span> : undefined}
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Primary                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const defaultContext: readonly ContextEntry[] = [
  { key: 'task', kind: 'task-document', name: 'task.md', required: true, locked: true },
  {
    key: 'overview',
    kind: 'specification-document',
    name: 'Overview',
    ref: 'overview.md',
    required: true,
    note: 'Default',
  },
];

function TaskBody({
  item,
  scenario,
  narrow,
}: {
  item: MockTask;
  scenario: TaskScenario;
  narrow: boolean;
}) {
  const type = typeOf(item);
  const view = item.workflow;
  const editable = item.status !== 'cancelled' && item.workflow.position.kind !== 'terminal';
  const entries = item.id === 'T-04' ? draftContext : defaultContext;
  const missing = entries.filter((entry) => entry.problem === 'missing' && entry.required);
  const primaryAction =
    item.status === 'draft' ? (
      <Button>Approve</Button>
    ) : item.status === 'on-hold' ? (
      <Button>Resume</Button>
    ) : undefined;

  return (
    <div className="grid max-w-content-standard gap-8">
      <div className="grid gap-2">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon="arrow-right"
          className="-ml-2 w-fit [&_svg]:rotate-180"
        >
          Back to specification
        </Button>
        <Typography as="h1" variant="title-lg" className="[overflow-wrap:anywhere]">
          {item.title}
        </Typography>
        <Typography as="p" variant="body-sm" className="text-content-muted">
          <span className="font-mono">{item.id}</span> · {type.title}
        </Typography>
        {item.status === 'cancelled' ? <PreparationNotice item={item} /> : null}
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {item.summary}
        </Typography>
      </div>
      {item.status === 'cancelled' ? null : (
        <WorkflowPanel
          view={view}
          headingId="task-now-heading"
          status={
            item.status === 'draft' || item.status === 'on-hold' ? (
              <PreparationNotice item={item} />
            ) : undefined
          }
          blockers={
            missing.length > 0 ? (
              <InlineNote tone="danger">
                <span className="font-medium text-content-primary">
                  {missing.length} required context entry is missing:
                </span>{' '}
                {missing.map((entry) => entry.name).join(', ')}. The task cannot start until it is
                replaced or removed.{' '}
                <a href="#task-context-heading" className="text-content-link hover:underline">
                  See Context
                </a>
              </InlineNote>
            ) : undefined
          }
          primaryAction={primaryAction}
          startLabel={
            item.workflow.position.kind === 'not-started'
              ? `Start ${item.workflow.position.firstStep}`
              : undefined
          }
        />
      )}
      <TaskDocumentsSection editable={editable} collapsible={narrow} />
      <TaskContextSection
        entries={entries}
        editable={editable}
        menuOpen={scenario === 'author-add-menu'}
        rowMenuFor={scenario === 'author-row-menu' ? 'interaction' : undefined}
        collapsible={narrow}
      />
      <TaskDependenciesSection item={item} editable={editable} collapsible={narrow} />
    </div>
  );
}

/** Approve is allowed with missing context (a dependency may produce it), but it says so first. */
function ApproveDialog({ item }: { item: MockTask }) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {item.id}</DialogTitle>
          <DialogDescription>
            The task becomes ready and can start once its dependencies are done.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Alert tone="attention" title="1 required context entry is missing">
            Old login flow (notes/old-login-flow.md). The task cannot start until it is fixed; you
            can approve now if a dependency will produce it.
          </Alert>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function dialogFor(item: MockTask, scenario: TaskScenario): ReactNode {
  const type = typeOf(item);
  switch (scenario) {
    case 'first-start':
    case 'start-definition-changed':
    case 'start-changed-since-preview':
    case 'start-type-not-allowed':
      return (
        <StartTaskDialog
          taskId={item.id}
          taskType={type.title}
          workflow={type.workflow.title}
          revision={type.workflow.revision}
          firstStep={type.steps[0]!}
          refusal={
            scenario === 'start-definition-changed'
              ? 'definition-changed'
              : scenario === 'start-changed-since-preview'
                ? 'changed-since-preview'
                : scenario === 'start-type-not-allowed'
                  ? 'task-type-not-allowed'
                  : undefined
          }
        />
      );
    case 'finish-review-failed':
      return (
        <FinishStepDialog
          step="review"
          attempt={1}
          transitions={reviewView.transitions!}
          initialTransition="changes-requested"
          initialFeedback={reviewFailed.feedback}
        />
      );
    case 'finish-feedback-missing':
      return (
        <FinishStepDialog
          step="review"
          attempt={1}
          transitions={reviewView.transitions!}
          initialTransition="changes-requested"
          showMissingFeedback
          artifacts={['notes/review-1.md']}
        />
      );
    case 'return':
      return <ReturnStepDialog current="implement" steps={['design']} />;
    case 'edit-details':
      return <EditDetailsDialog item={item} conflict={false} />;
    case 'edit-conflict':
      return <EditDetailsDialog item={item} conflict />;
    case 'author-add-spec-doc':
      return <AddContextDialog kind="specification-document" />;
    case 'author-add-project-doc':
      return <AddContextDialog kind="repository-document" />;
    case 'author-add-path':
      return <AddContextDialog kind="path" />;
    case 'author-dependencies':
      return <AddDependencyDialog item={item} />;
    case 'approve-missing-context':
      return <ApproveDialog item={item} />;
    default:
      return null;
  }
}

function Workspace({
  scenario,
  width,
  documentPlacement = 'secondary',
  historyOpen = false,
}: TaskMockProps) {
  const item = subjectFor(scenario);
  const narrow = width < 730;
  const authoringWithDocument = scenario === 'author-with-document';
  // Narrow shows one surface: while authoring, the Task page (the document is a pushed page).
  const editing = scenario === 'edit-document' || (authoringWithDocument && !narrow);
  const hasHistory = item.started && !editing;
  const showHistory = hasHistory && historyOpen;
  const header = (
    <WorkspaceHeader
      title={`${specification.title} / ${item.id}`}
      icon="list-checks"
      as="span"
      actions={[
        ...(hasHistory
          ? [
              {
                // The same history toggle as the Overview, at every width.
                id: 'history',
                label: 'Task history',
                icon: 'clock',
                presentation: 'icon',
                direct: 'always',
                checked: showHistory && !narrow,
                onPress: noop,
              } as const,
            ]
          : []),
        ...lifecycleActions(item),
      ]}
      labels={{ moreActions: 'More actions' }}
    />
  );

  if (scenario === 'edit-document' && (narrow || documentPlacement === 'primary')) {
    // B (and Narrow for A): the document replaces the Task page; Back returns to the Task.
    return (
      <DocumentServices taskId={item.id}>
        <AppWorkspaceProvider scopeKey="workflow-manual-task-doc">
          <AppWorkspace
            scroll="content"
            fit="available"
            labels={{ backToPrimary: 'Back to task', closeSecondary: 'Close' }}
          >
            <AppWorkspace.Primary header={<TaskDocumentHeader back taskId={item.id} />}>
              <AppContent className="h-full w-full">
                <DocumentEditor />
              </AppContent>
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppWorkspaceProvider>
      </DocumentServices>
    );
  }

  const workspace = (
    <AppWorkspaceProvider scopeKey="workflow-manual-task">
      <AppWorkspace
        fit="available"
        scroll={editing ? 'content' : undefined}
        labels={{ backToPrimary: 'Back to task', closeSecondary: 'Close' }}
      >
        <AppWorkspace.Primary header={header}>
          <AppContent className="w-full max-w-full">
            <AppWorkspaceBody scroll={editing ? 'area' : undefined}>
              <TaskBody item={item} scenario={scenario} narrow={narrow} />
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
        {editing && !narrow ? (
          <AppWorkspace.Secondary
            open
            onOpenChange={noop}
            headerVariant="tab-rail"
            header={<TaskDocumentHeader taskId={item.id} more={authoringWithDocument} />}
          >
            <AppContent className="h-full w-full">
              <DocumentEditor />
            </AppContent>
          </AppWorkspace.Secondary>
        ) : showHistory && !narrow ? (
          <AppWorkspace.Secondary
            open
            onOpenChange={noop}
            header={<WorkspaceHeader title="Task history" icon="clock" headingLevel={2} />}
          >
            <AppContent className="w-full">
              <AppWorkspaceBody>
                <WorkflowHistory
                  entries={
                    item.id === 'T-02'
                      ? backendHistory
                      : [
                          {
                            step: 'spike',
                            attempt: 1,
                            actor: 'Dominik',
                            at: 'Yesterday 16:05',
                            result: 'Recommendation written',
                            toStep: null,
                            artifacts: ['notes/sdk-comparison.md'],
                            tone: 'success',
                          },
                        ]
                  }
                  label="Task history"
                />
              </AppWorkspaceBody>
            </AppContent>
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
      {dialogFor(item, scenario)}
    </AppWorkspaceProvider>
  );

  return editing ? <DocumentServices taskId={item.id}>{workspace}</DocumentServices> : workspace;
}

export function TaskMock(props: TaskMockProps): ReactNode {
  const { width, height = 900 } = props;

  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<MockNavigation current="tasks" />}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Specification navigation' }}
        >
          <Workspace key={JSON.stringify(props)} {...props} />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
