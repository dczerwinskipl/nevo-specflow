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
  CheckboxField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Icon,
  InformationList,
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
import { OperationalRow } from '../../shared/operational-list';
import { WorkspaceSection } from '../../shared/workspace-section';
import { MockNavigation } from '../editor-mode/MockNavigation.stories-support';
import {
  backendHistory,
  reviewFailed,
  specification,
  task,
  taskDocument,
  tasks,
  typeOf,
  type MockTask,
  type WorkflowView,
} from './fixtures.stories-support';
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
  | 'edit-document';

export interface TaskMockProps {
  width: number;
  height?: number;
  scenario: TaskScenario;
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
  switch (scenario) {
    case 'draft':
      return task('T-04');
    case 'first-start':
    case 'start-definition-changed':
    case 'start-type-not-allowed':
      return task('T-07');
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

  const edit = { id: 'edit', label: 'Edit details…', icon: 'edit', onPress: noop } as const;
  const hold = { id: 'hold', label: 'Put on hold', onPress: noop } as const;
  const cancel = { id: 'cancel', label: 'Cancel task…', tone: 'danger', onPress: noop } as const;
  const remove = { id: 'remove', label: 'Remove task…', tone: 'danger', onPress: noop } as const;
  const neverStarted = !item.started;
  switch (item.status) {
    case 'draft':
      return [
        { id: 'approve', label: 'Approve', primary: true, direct: 'always', onPress: noop },
        edit,
        hold,
        cancel,
        remove,
      ];
    case 'on-hold':
      return [
        { id: 'resume', label: 'Resume', primary: true, direct: 'always', onPress: noop },
        edit,
        cancel,
        ...(neverStarted ? [remove] : []),
      ];
    default:
      return [edit, ...(active ? [] : [hold]), cancel, ...(neverStarted ? [remove] : [])];
  }
}

function PreparationNotice({ item }: { item: MockTask }) {
  switch (item.status) {
    case 'draft':
      return (
        <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-status-attention">
          <Icon name="triangle-alert" size="sm" />
          Draft · approve it to make it ready to start
        </span>
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
            Title, summary and dependencies. The content is in task.md.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {conflict ? (
            <Alert
              tone="danger"
              title={`Not saved: ${item.id} changed since you opened it`}
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Copy my changes
                  </Button>
                  <Button size="sm" variant="secondary">
                    Load the latest version…
                  </Button>
                </>
              }
            >
              Dominik changed the summary and the dependencies a minute ago. Your edits are still in
              the form.
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
              {typeOf(item).title} · {item.workflow.definition.title} rev{' '}
              {item.workflow.definition.revision}. Fixed since the task started.
            </Typography>
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-3 text-label-sm text-content-primary">Depends on</legend>
            {tasks
              .filter((other) => other.id !== item.id && other.status !== 'cancelled')
              .slice(0, 4)
              .map((other) => (
                <CheckboxField
                  key={other.id}
                  label={`${other.id} · ${other.title}`}
                  defaultChecked={item.dependsOn.includes(other.id)}
                />
              ))}
          </fieldset>
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

const taskDocumentRecord = documentContentFixture({
  id: 'tasks/T-02/task',
  title: 'Token exchange endpoint and session cookie',
  path: 'tasks/T-02/task.md',
  content: taskDocument,
  revision: '3',
});

function DocumentServices({ children }: { children: ReactNode }) {
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

function TaskDocumentHeader({ back }: { back?: boolean }) {
  const { actions, dirty } = documentHeaderModel(useDocumentEditor(), useTranslation().t);

  return (
    <WorkspaceHeader
      title={back ? 'T-02 · task.md' : 'task.md'}
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

function TaskBody({ item, onHistory }: { item: MockTask; onHistory?: () => void }) {
  const type = typeOf(item);
  const dependencies = tasks.filter((other) => item.dependsOn.includes(other.id));
  const view = item.workflow;

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
        <PreparationNotice item={item} />
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {item.summary}
        </Typography>
      </div>
      {item.status === 'cancelled' ? null : (
        <WorkflowPanel
          view={view}
          headingId="task-workflow-heading"
          startLabel={
            item.workflow.position.kind === 'not-started'
              ? `Start ${item.workflow.position.firstStep}…`
              : undefined
          }
          onHistory={onHistory}
        />
      )}
      <WorkspaceSection aria-labelledby="task-document-heading">
        <WorkspaceSection.Header id="task-document-heading" title="Task document" icon="file" />
        <InformationList>
          <OperationalRow
            primary="task.md"
            onPrimaryClick={noop}
            compactFacts={['Markdown', 'Edited today 09:12']}
            trailing={
              item.status === 'cancelled' ? undefined : (
                <Button size="sm" variant="secondary" leadingIcon="edit">
                  Edit
                </Button>
              )
            }
          />
        </InformationList>
      </WorkspaceSection>
      {dependencies.length > 0 ? (
        <WorkspaceSection aria-labelledby="task-dependencies-heading">
          <WorkspaceSection.Header
            id="task-dependencies-heading"
            title="Depends on"
            icon="network"
            count={dependencies.length}
          />
          <InformationList>
            {dependencies.map((other) => {
              const finished = other.workflow.position.kind === 'terminal';

              return (
                <OperationalRow
                  key={other.id}
                  primary={other.title}
                  onPrimaryClick={noop}
                  compactFacts={[{ text: other.id, mono: true }, typeOf(other).title]}
                  supporting={
                    finished
                      ? { text: 'Completed', tone: 'success', icon: 'circle-check' }
                      : other.status === 'draft'
                        ? {
                            text: 'Draft · needs approval',
                            tone: 'attention',
                            icon: 'triangle-alert',
                          }
                        : other.workflow.position.kind === 'active'
                          ? {
                              text: `${other.workflow.position.step} · attempt ${other.workflow.position.attempt} · in progress`,
                              tone: 'info',
                              icon: 'workflow',
                            }
                          : { text: 'Not finished', icon: 'clock' }
                  }
                />
              );
            })}
          </InformationList>
        </WorkspaceSection>
      ) : null}
    </div>
  );
}

function dialogFor(item: MockTask, scenario: TaskScenario): ReactNode {
  const type = typeOf(item);
  switch (scenario) {
    case 'first-start':
    case 'start-definition-changed':
    case 'start-type-not-allowed':
      return (
        <StartTaskDialog
          taskId={item.id}
          taskType={scenario === 'start-type-not-allowed' ? 'Spike' : type.title}
          workflow={scenario === 'start-type-not-allowed' ? 'Research' : type.workflow.title}
          revision={scenario === 'start-type-not-allowed' ? 2 : type.workflow.revision}
          firstStep={type.steps[0]!}
          refusal={
            scenario === 'start-definition-changed'
              ? 'definition-changed'
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
      return <ReturnStepDialog current="implement" steps={['spike']} />;
    case 'edit-details':
      return <EditDetailsDialog item={item} conflict={false} />;
    case 'edit-conflict':
      return <EditDetailsDialog item={item} conflict />;
    default:
      return null;
  }
}

function Workspace({ scenario, width, documentPlacement = 'secondary' }: TaskMockProps) {
  const item = subjectFor(scenario);
  const narrow = width < 730;
  const editing = scenario === 'edit-document';
  const hasHistory = item.started && !editing;
  const header = (
    <WorkspaceHeader
      title={`${specification.title} / ${item.id}`}
      icon="list-checks"
      as="span"
      actions={lifecycleActions(item)}
      labels={{ moreActions: 'More actions' }}
    />
  );

  if (editing && (narrow || documentPlacement === 'primary')) {
    // B (and Narrow for A): the document replaces the Task page; Back returns to the Task.
    return (
      <DocumentServices>
        <AppWorkspaceProvider scopeKey="workflow-manual-task-doc">
          <AppWorkspace
            scroll="content"
            fit="available"
            labels={{ backToPrimary: 'Back to task', closeSecondary: 'Close' }}
          >
            <AppWorkspace.Primary header={<TaskDocumentHeader back />}>
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
              <TaskBody item={item} onHistory={narrow && hasHistory ? noop : undefined} />
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
        {editing && !narrow ? (
          <AppWorkspace.Secondary open onOpenChange={noop} header={<TaskDocumentHeader />}>
            <AppContent className="h-full w-full">
              <DocumentEditor />
            </AppContent>
          </AppWorkspace.Secondary>
        ) : hasHistory && !narrow ? (
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

  return editing ? <DocumentServices>{workspace}</DocumentServices> : workspace;
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
