import { useState, type ReactNode } from 'react';
import {
  Alert,
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Button,
  Checkbox,
  CheckboxField,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  InformationList,
  MenuItem,
  OverflowMenu,
  RadioGroup,
  RadioGroupOption,
  TextArea,
  TextInput,
  Typography,
  WorkspaceHeader,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { OperationalRow } from '../../shared/operational-list';
import type { SemanticSupporting } from '../../shared/operational-list/OperationalRow.types';
import { WorkspaceSection } from '../../shared/workspace-section';
import { TaskGroupHeader } from '../../features/tasks/contributions/specification-work/TaskGroupHeader';
import { MockNavigation } from '../editor-mode/MockNavigation.stories-support';
import {
  specification,
  specificationHistory,
  task,
  taskTypes,
  tasks,
  typeOf,
  type MockTask,
  type WorkflowView,
} from './fixtures.stories-support';
import { FinishStepDialog, WorkflowHistory, WorkflowPanel } from './WorkflowPanel.stories-support';

/*
 * PRESENTATION MOCK ONLY (docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md).
 * Static fixtures, no routing, no backend. Each story pins one frame width. Real AppShell,
 * AppWorkspace, WorkspaceHeader, WorkspaceSection, TaskGroupHeader and OperationalRow; the workflow
 * panel and dialogs are composed from Nevo UI primitives.
 */

export type SpecificationScenario =
  | 'empty'
  | 'authoring'
  | 'create-task'
  | 'breakdown'
  | 'finish-breakdown'
  | 'waiting'
  | 'close-blocked'
  | 'close-ready';

export interface SpecificationMockProps {
  width: number;
  height?: number;
  scenario: SpecificationScenario;
}

const noop = () => undefined;

/* ------------------------------------------------------------------------------------------ */
/* Scenario data                                                                                */
/* ------------------------------------------------------------------------------------------ */

const specDefinition = specification.workflow;

function specWorkflow(scenario: SpecificationScenario, list: readonly MockTask[]): WorkflowView {
  switch (scenario) {
    case 'empty':
    case 'authoring':
    case 'create-task':
      return {
        definition: specDefinition,
        position: { kind: 'not-started', firstStep: 'requirements' },
        canStart: true,
      };
    case 'breakdown':
    case 'finish-breakdown':
      return {
        definition: specDefinition,
        position: { kind: 'active', step: 'breakdown', attempt: 1, since: '14:20', actor: 'you' },
        transitions: breakdownTransitions,
        returnSteps: ['requirements', 'specification'],
        latest: {
          fromStep: 'specification',
          attempt: 1,
          result: 'Specification agreed',
          toStep: 'breakdown',
          actor: 'Dominik',
          at: 'Yesterday 12:30',
        },
      };
    case 'close-ready':
      return {
        definition: specDefinition,
        position: {
          kind: 'terminal',
          summary: 'All tasks finished · wait-for-tasks ended today 16:40',
          at: 'Today 16:40',
        },
      };
    default: {
      const open = list.filter(
        (item) => item.status !== 'cancelled' && item.workflow.position.kind !== 'terminal',
      );

      return {
        definition: specDefinition,
        position: {
          kind: 'waiting',
          step: 'wait-for-tasks',
          reason: `Waiting for ${open.length} of ${list.filter((item) => item.status !== 'cancelled').length} tasks`,
          note: 'Continues by itself when every task is done or cancelled',
          blockers: open.map((item) => ({
            id: item.id,
            title: item.title,
            ...rowState(item),
          })),
        },
        returnSteps: ['breakdown'],
        latest: {
          fromStep: 'breakdown',
          attempt: 1,
          result: 'Tasks approved',
          toStep: 'wait-for-tasks',
          actor: 'Dominik',
          at: 'Yesterday 15:10',
        },
      };
    }
  }
}

const breakdownTransitions = [
  { id: 'tasks-approved', label: 'Tasks approved', to: 'wait-for-tasks', feedback: 'optional' },
  {
    id: 'needs-rework',
    label: 'Specification needs rework',
    to: 'specification',
    feedback: 'required',
  },
] as const;

function tasksFor(scenario: SpecificationScenario): readonly MockTask[] {
  switch (scenario) {
    case 'empty':
      return [];
    case 'authoring':
    case 'create-task':
    case 'breakdown':
    case 'finish-breakdown':
      // Before execution: nothing started yet; drafts, ready, on hold.
      return [
        task('T-07'),
        { ...task('T-02'), started: false, status: 'draft', workflow: task('T-04').workflow },
        task('T-04'),
        task('T-05'),
      ];
    case 'close-ready':
      return tasks
        .filter((item) => item.id !== 'T-05')
        .map((item) =>
          item.status === 'cancelled'
            ? item
            : {
                ...item,
                status: 'ready' as const,
                started: true,
                workflow: {
                  ...item.workflow,
                  position: {
                    kind: 'terminal' as const,
                    summary: `Finished ${typeOf(item).steps.at(-1)}: Approved`,
                    at: 'Today',
                  },
                },
              },
        );
    default:
      return tasks;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Task rows                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function rowState(item: MockTask): { state: string; tone: 'attention' | 'info' | 'neutral' } {
  const position = item.workflow.position;
  if (item.status === 'cancelled') {
    return { state: 'Cancelled', tone: 'neutral' };
  }

  if (item.status === 'draft') {
    return { state: 'Draft · needs approval', tone: 'attention' };
  }

  if (item.status === 'on-hold') {
    return { state: 'On hold', tone: 'neutral' };
  }

  switch (position.kind) {
    case 'active':
      return {
        state: `${position.step} · attempt ${position.attempt} · in progress`,
        tone: 'info',
      };
    case 'ready':
      return { state: `${position.step} · ready to start`, tone: 'neutral' };
    case 'waiting':
      return {
        state: `Waiting for ${position.blockers.map((blocker) => blocker.id).join(', ')}`,
        tone: 'neutral',
      };
    case 'terminal':
      return { state: 'Completed', tone: 'neutral' };
    default:
      return { state: `Not started · first step ${position.firstStep}`, tone: 'neutral' };
  }
}

function supportingFor(item: MockTask): SemanticSupporting {
  const position = item.workflow.position;
  const after = item.dependsOn.length > 0 ? ` · after ${item.dependsOn.join(', ')}` : '';
  if (item.status === 'cancelled') {
    return { text: 'Cancelled', textClassName: 'text-content-muted' };
  }

  if (item.status === 'draft') {
    return { text: `Draft · needs approval${after}`, tone: 'attention', icon: 'triangle-alert' };
  }

  if (item.status === 'on-hold') {
    return { text: `On hold${after}` };
  }

  switch (position.kind) {
    case 'active':
      return {
        text: `${position.step} · attempt ${position.attempt} · in progress`,
        tone: 'info',
        icon: 'workflow',
      };
    case 'waiting':
      return {
        text: `Waiting for ${position.blockers.map((blocker) => blocker.id).join(', ')}`,
        icon: 'clock',
      };
    case 'terminal':
      return { text: position.summary, tone: 'success', icon: 'circle-check' };
    case 'ready':
      return { text: `${position.step} · ready to start${after}` };
    default:
      return { text: `Not started · first step ${position.firstStep}${after}` };
  }
}

type GroupId = 'approval' | 'progress' | 'ready' | 'waiting' | 'done' | 'parked';

const groups: readonly {
  id: GroupId;
  name: string;
  tone: 'attention' | 'info' | 'neutral' | 'success';
}[] = [
  { id: 'approval', name: 'Needs approval', tone: 'attention' },
  { id: 'progress', name: 'In progress', tone: 'info' },
  { id: 'ready', name: 'Ready to start', tone: 'neutral' },
  { id: 'waiting', name: 'Waiting', tone: 'neutral' },
  { id: 'done', name: 'Done', tone: 'success' },
  { id: 'parked', name: 'On hold or cancelled', tone: 'neutral' },
];

function groupOf(item: MockTask): GroupId {
  if (item.status === 'draft') {
    return 'approval';
  }

  if (item.status === 'on-hold' || item.status === 'cancelled') {
    return 'parked';
  }

  switch (item.workflow.position.kind) {
    case 'active':
    case 'ready':
      return 'progress';
    case 'waiting':
      return 'waiting';
    case 'terminal':
      return 'done';
    default:
      return 'ready';
  }
}

function TaskRowMenu({ item }: { item: MockTask }) {
  // Only actions the Task's lifecycle allows now (the projection decides; the UI omits the rest).
  const neverStarted = !item.started;

  return (
    <OverflowMenu label={item.id} triggerLabel={`Actions for ${item.id}`}>
      <MenuItem leadingIcon="open-full" onSelect={noop}>
        Open in new window
      </MenuItem>
      {item.status === 'draft' ? <MenuItem onSelect={noop}>Approve</MenuItem> : null}
      {item.status === 'on-hold' ? <MenuItem onSelect={noop}>Resume</MenuItem> : null}
      {item.status === 'ready' &&
      item.workflow.position.kind !== 'active' &&
      item.workflow.position.kind !== 'terminal' ? (
        <MenuItem onSelect={noop}>Put on hold</MenuItem>
      ) : null}
      {item.status !== 'cancelled' && item.workflow.position.kind !== 'terminal' ? (
        <MenuItem onSelect={noop}>Cancel task…</MenuItem>
      ) : null}
      {neverStarted && item.status !== 'cancelled' ? (
        <MenuItem onSelect={noop}>Remove task…</MenuItem>
      ) : null}
    </OverflowMenu>
  );
}

function TasksList({ list, onCreate }: { list: readonly MockTask[]; onCreate: () => void }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<GroupId>>(new Set(['parked']));
  const done = list.filter((item) => item.workflow.position.kind === 'terminal').length;
  const counted = list.filter((item) => item.status !== 'cancelled').length;

  return (
    <WorkspaceSection aria-labelledby="tasks-heading">
      <WorkspaceSection.Header
        id="tasks-heading"
        title="Tasks"
        icon="list-checks"
        count={list.length === 0 ? undefined : `${done} / ${counted} completed`}
        actions={
          <Button size="sm" variant="secondary" leadingIcon="plus" onClick={onCreate}>
            New task
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No tasks yet"
          description="Create tasks now or after the breakdown step. Tasks can be created before the workflow starts."
        />
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => {
            const members = list.filter((item) => groupOf(item) === group.id);
            if (members.length === 0) {
              return null;
            }

            const isCollapsed = collapsed.has(group.id);

            return (
              <div key={group.id} className="grid gap-1">
                <TaskGroupHeader
                  name={group.name}
                  count={members.length}
                  isCollapsed={isCollapsed}
                  tone={group.tone}
                  controlsId={`mock-group-${group.id}`}
                  onToggle={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(group.id)) {
                        next.delete(group.id);
                      } else {
                        next.add(group.id);
                      }

                      return next;
                    })
                  }
                />
                {!isCollapsed ? (
                  <InformationList selectable id={`mock-group-${group.id}`}>
                    {members.map((item) => (
                      <OperationalRow
                        key={item.id}
                        primary={item.title}
                        onPrimaryClick={noop}
                        compactFacts={[{ text: item.id, mono: true }, typeOf(item).title]}
                        supporting={supportingFor(item)}
                        leading={
                          <div className="flex items-center justify-center">
                            <Checkbox aria-label={`Select ${item.id}`} />
                          </div>
                        }
                        trailing={<TaskRowMenu item={item} />}
                      />
                    ))}
                  </InformationList>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Dialogs                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const allowedTypes = taskTypes;

function CreateTaskDialog({ existing }: { existing: readonly MockTask[] }) {
  const [type, setType] = useState('backend');

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Created as a draft in {specification.title}. Approve it to make it ready to start.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <RadioGroup
            value={type}
            onValueChange={setType}
            aria-label="Task type"
            className="grid gap-4"
          >
            <Typography as="p" variant="label-sm">
              Task type · allowed by {specification.archetype}
            </Typography>
            {allowedTypes.map((item) => (
              <RadioGroupOption
                key={item.id}
                value={item.id}
                label={item.title}
                description={`${item.useWhen} Workflow: ${item.workflow.title} (${item.steps.join(' → ')}).`}
              />
            ))}
          </RadioGroup>
          <Field>
            <Field.Label>Title</Field.Label>
            <TextInput defaultValue="Rate-limit session refresh" />
          </Field>
          <Field>
            <Field.Label>Summary</Field.Label>
            <TextArea
              rows={2}
              defaultValue="Refuse more than one refresh per session per minute."
            />
            <Field.Description>
              One or two sentences for the task list. The task document (task.md) holds the detail.
            </Field.Description>
          </Field>
          <fieldset className="grid gap-3">
            <legend className="mb-3 text-label-sm text-content-primary">
              Depends on (optional)
            </legend>
            {existing
              .filter((item) => item.status !== 'cancelled')
              .map((item) => (
                <CheckboxField
                  key={item.id}
                  label={`${item.id} · ${item.title}`}
                  defaultChecked={item.id === 'T-02'}
                />
              ))}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ ready, list }: { ready: boolean; list: readonly MockTask[] }) {
  const unfinished = list.filter(
    (item) => item.status === 'ready' && item.workflow.position.kind !== 'terminal',
  );
  const drafts = list.filter((item) => item.status === 'draft');
  const onHold = list.filter((item) => item.status === 'on-hold');
  const cancelled = list.filter((item) => item.status === 'cancelled');
  const done = list.filter((item) => item.workflow.position.kind === 'terminal');
  const group = (
    title: string,
    members: readonly MockTask[],
    suffix?: (item: MockTask) => string,
  ) =>
    members.length === 0 ? null : (
      <div className="grid gap-1.5">
        <Typography as="h3" variant="label-sm">
          {title} · {members.length}
        </Typography>
        <ul className="grid gap-1">
          {members.map((item) => (
            <li key={item.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 text-body-sm">
              <span className="font-mono text-content-muted">{item.id}</span>
              <span className="min-w-0">
                <a href={`#${item.id}`} className="text-content-primary hover:text-content-link">
                  {item.title}
                </a>
                <span className="block text-content-secondary">
                  {suffix ? suffix(item) : rowState(item).state}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {specification.title}</DialogTitle>
          <DialogDescription>
            {ready
              ? 'Everything required is finished. Closing also runs the repository checks.'
              : 'Closing is checked against the specification workflow and its tasks.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {ready ? (
            <>
              <Alert tone="success" title="Ready to close">
                The {specification.workflow.title} workflow is complete, {done.length} tasks are
                done and {cancelled.length} was cancelled.
              </Alert>
              {group(
                'Cancelled, not delivered',
                cancelled,
                () => 'Cancelled by Dominik · Yesterday',
              )}
            </>
          ) : (
            <>
              <Alert tone="attention" title="Not ready to close">
                Finish, cancel or remove the work below, then close again.
              </Alert>
              <div className="grid gap-1.5">
                <Typography as="h3" variant="label-sm">
                  Specification workflow · 1
                </Typography>
                <p className="text-body-sm text-content-secondary">
                  <span className="font-mono">wait-for-tasks</span> is still waiting.
                </p>
              </div>
              {group('Unfinished tasks', unfinished)}
              {group('Drafts', drafts, () => 'Draft · approve and finish it, or remove it')}
              {group('On hold', onHold, () => 'On hold · resume and finish it, or cancel it')}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">{ready ? 'Cancel' : 'Close'}</Button>
          {ready ? <Button>Close specification</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Workspace                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function Overview({
  scenario,
  list,
  onHistory,
}: {
  scenario: SpecificationScenario;
  list: readonly MockTask[];
  onHistory?: () => void;
}) {
  const [creating, setCreating] = useState(scenario === 'create-task');
  const view = specWorkflow(scenario, list);

  return (
    <div className="grid max-w-content-standard gap-8">
      <div className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          {specification.title}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {specification.description}
        </Typography>
      </div>
      <WorkflowPanel
        view={view}
        headingId="spec-workflow-heading"
        startLabel="Start workflow"
        onHistory={onHistory}
      />
      {scenario === 'close-ready' ? (
        <div className="-mt-4">
          <Button>Close specification…</Button>
        </div>
      ) : null}
      <TasksList list={list} onCreate={() => setCreating(true)} />
      {creating ? <CreateTaskDialog existing={list} /> : null}
      {scenario === 'finish-breakdown' ? (
        <FinishStepDialog
          step="breakdown"
          attempt={1}
          transitions={breakdownTransitions}
          initialTransition="tasks-approved"
          initialFeedback="Four tasks; T-02 and T-04 are drafts that still need approval."
        />
      ) : null}
      {scenario === 'close-blocked' ? <CloseDialog ready={false} list={list} /> : null}
      {scenario === 'close-ready' ? <CloseDialog ready list={list} /> : null}
    </div>
  );
}

function Workspace({ scenario, width }: SpecificationMockProps) {
  const list = tasksFor(scenario);
  const hasHistory = scenario !== 'empty' && scenario !== 'authoring' && scenario !== 'create-task';
  const narrow = width < 730;
  const actions: WorkspaceHeaderAction[] = [
    ...(hasHistory && !narrow
      ? [
          {
            id: 'history',
            label: 'Activity history',
            icon: 'clock',
            presentation: 'icon',
            direct: 'always',
            checked: true,
            onPress: noop,
          } as const,
        ]
      : []),
    { id: 'close', label: 'Close specification…', onPress: noop },
  ];

  return (
    <AppWorkspaceProvider scopeKey="workflow-manual-spec-mock">
      <AppWorkspace
        fit="available"
        labels={{ backToPrimary: 'Back to overview', closeSecondary: 'Close activity history' }}
      >
        <AppWorkspace.Primary
          header={
            <WorkspaceHeader
              title="Overview"
              actions={actions}
              labels={{ moreActions: 'More actions' }}
            />
          }
        >
          <AppContent className="w-full max-w-full">
            <AppWorkspaceBody>
              <Overview
                scenario={scenario}
                list={list}
                onHistory={narrow && hasHistory ? noop : undefined}
              />
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
        {hasHistory && !narrow ? (
          <AppWorkspace.Secondary
            open
            onOpenChange={noop}
            header={<WorkspaceHeader title="Activity history" headingLevel={2} />}
          >
            <AppContent className="w-full">
              <AppWorkspaceBody>
                <WorkflowHistory entries={specificationHistory} label="Activity history" />
              </AppWorkspaceBody>
            </AppContent>
          </AppWorkspace.Secondary>
        ) : null}
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}

export function SpecificationMock(props: SpecificationMockProps): ReactNode {
  const { width, height = 900 } = props;

  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<MockNavigation current="overview" />}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Specification navigation' }}
        >
          <Workspace key={JSON.stringify(props)} {...props} />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
