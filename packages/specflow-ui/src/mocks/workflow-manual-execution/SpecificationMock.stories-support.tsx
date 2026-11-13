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
  InlineNote,
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
import { defaultGrouping, groupTasks } from './dashboard-grouping.stories-support';
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
  stepTitle,
  taskProgress,
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
  | 'close-ready'
  | 'abandon'
  | 'abandon-blocked'
  | 'abandoned'
  | 'close-after-abandon';

export interface SpecificationMockProps {
  width: number;
  height?: number;
  scenario: SpecificationScenario;
  /** Activity history Secondary: closed by default, opened with the header history toggle. */
  historyOpen?: boolean;
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
    case 'abandoned':
    case 'close-after-abandon':
      return {
        definition: specDefinition,
        position: {
          kind: 'terminal',
          outcome: 'abandoned',
          summary: 'Abandoned while waiting for tasks · today 16:40 by Dominik',
          at: 'Today 16:40',
        },
      };
    case 'close-ready':
      return {
        definition: specDefinition,
        position: {
          kind: 'terminal',
          summary: 'All tasks finished · Waiting for tasks ended today 16:40',
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
          see: { href: '#tasks-heading', label: 'See Tasks' },
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
    case 'abandoned':
    case 'close-after-abandon':
      // Abandon ended every Task run as abandoned and cancelled every non-terminal Task.
      return tasks.map((item) =>
        item.workflow.position.kind === 'terminal' || item.status === 'cancelled'
          ? item
          : { ...item, status: 'cancelled' as const },
      );
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
                    summary: `Finished ${stepTitle(typeOf(item).steps.at(-1)!)}: Approved`,
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
    return { state: 'Draft · needs approval', tone: 'neutral' };
  }

  if (item.status === 'on-hold') {
    return { state: 'On hold', tone: 'neutral' };
  }

  switch (position.kind) {
    case 'active':
      return {
        state: `${stepTitle(position.step)} · in progress`,
        tone: 'info',
      };
    case 'ready':
      return { state: `${stepTitle(position.step)} · ready to start`, tone: 'neutral' };
    case 'waiting':
      return {
        state: `Waiting for ${position.blockers.map((blocker) => blocker.id).join(', ')}`,
        tone: 'neutral',
      };
    case 'terminal':
      return { state: 'Completed', tone: 'neutral' };
    default:
      return {
        state: `Not started · first step ${stepTitle(position.firstStep)}`,
        tone: 'neutral',
      };
  }
}

function supportingFor(item: MockTask): SemanticSupporting {
  const position = item.workflow.position;
  const after = item.dependsOn.length > 0 ? ` · after ${item.dependsOn.join(', ')}` : '';
  if (item.status === 'cancelled') {
    return { text: 'Cancelled', textClassName: 'text-content-muted' };
  }

  if (item.status === 'draft') {
    // A draft is not attention (only `tasks-stuck` aggregates drafts that block the Specification).
    return { text: `Draft · needs approval${after}` };
  }

  if (item.status === 'on-hold') {
    return { text: `On hold${after}` };
  }

  switch (position.kind) {
    case 'active':
      return {
        text: `${stepTitle(position.step)} · in progress`,
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
      return { text: `${stepTitle(position.step)} · ready to start${after}` };
    default:
      return { text: `Not started · first step ${stepTitle(position.firstStep)}${after}` };
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
        <MenuItem onSelect={noop}>Cancel task</MenuItem>
      ) : null}
      {neverStarted && item.status !== 'cancelled' ? (
        <MenuItem onSelect={noop}>Remove task</MenuItem>
      ) : null}
    </OverflowMenu>
  );
}

export function TasksList({
  list,
  onCreate,
  canCreate = true,
  selectable = true,
  attention,
}: {
  list: readonly MockTask[];
  onCreate: () => void;
  canCreate?: boolean;
  /** Selection checkboxes (the planned "Run selected tasks", F12). */
  selectable?: boolean;
  /** Tasks the attention projection lists: marked on their row, they stay in their group. */
  attention?: ReadonlyMap<string, string>;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    new Set(defaultGrouping.filter((group) => group.collapsed).map((group) => group.id)),
  );

  return (
    <WorkspaceSection aria-labelledby="tasks-heading">
      <WorkspaceSection.Header
        id="tasks-heading"
        title="Tasks"
        icon="list-checks"
        count={list.length === 0 ? undefined : taskProgress(list).text}
        actions={
          canCreate ? (
            <Button size="sm" variant="secondary" leadingIcon="plus" onClick={onCreate}>
              New task
            </Button>
          ) : undefined
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
          {groupTasks(list).map(({ group, members }) => {
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
                  <InformationList selectable={selectable} id={`mock-group-${group.id}`}>
                    {members.map((item) => (
                      <OperationalRow
                        key={item.id}
                        primary={item.title}
                        onPrimaryClick={noop}
                        compactFacts={[{ text: item.id, mono: true }, typeOf(item).title]}
                        supporting={
                          attention?.has(item.id)
                            ? {
                                text: `Requires attention · ${attention.get(item.id)!}`,
                                tone: 'attention',
                                icon: 'triangle-alert',
                              }
                            : supportingFor(item)
                        }
                        leading={
                          selectable ? (
                            <div className="flex items-center justify-center">
                              <Checkbox aria-label={`Select ${item.id}`} />
                            </div>
                          ) : undefined
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
          <div className="grid gap-2">
            <Typography as="p" variant="label-sm" id="radio-task-type">
              Task type · allowed by {specification.archetype}
            </Typography>
            <RadioGroup value={type} onValueChange={setType} aria-labelledby="radio-task-type">
              {allowedTypes.map((item) => (
                <RadioGroupOption
                  key={item.id}
                  value={item.id}
                  label={item.title}
                  description={`${item.useWhen} Workflow: ${item.workflow.title} (${item.steps.map(stepTitle).join(' → ')}).`}
                />
              ))}
            </RadioGroup>
          </div>
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

interface BlockerItem {
  key: string;
  label: ReactNode;
  href: string;
  state: string;
}

interface BlockerGroup {
  title: string;
  /** One sentence: why this blocks and how it resolves. */
  explanation: string;
  items: readonly BlockerItem[];
  /** When the group is not a list of items (the workflow itself). */
  count?: number;
  /** The resolving action for the whole group, when there is one. */
  action?: { label: string; href: string };
}

const taskHref = (id: string) => `/specs/${specification.id}/tasks/${id}`;
const BLOCKER_ITEMS_SHOWN = 5;

function taskItems(members: readonly MockTask[], state?: (item: MockTask) => string) {
  return members.map((item) => ({
    key: item.id,
    href: taskHref(item.id),
    label: (
      <>
        <span className="font-mono text-content-muted">{item.id}</span> {item.title}
      </>
    ),
    state: state ? state(item) : rowState(item).state,
  }));
}

/**
 * The grouped-blocker layout shared by Close and Abandon. Groups come in a fixed order, each with
 * its count, one explanation, at most five linked items (then "and N more") and its action.
 */
function BlockerGroups({ groups }: { groups: readonly BlockerGroup[] }) {
  return (
    <div className="grid gap-5">
      {groups.map((group) => {
        const shown = group.items.slice(0, BLOCKER_ITEMS_SHOWN);
        const more = group.items.length - shown.length;

        return (
          <section key={group.title} className="grid gap-2" aria-label={group.title}>
            <div className="grid gap-0.5">
              <Typography as="h3" variant="label-sm">
                {group.title} · {group.count ?? group.items.length}
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {group.explanation}
              </Typography>
            </div>
            {shown.length > 0 ? (
              <ul className="grid gap-2">
                {shown.map((item) => (
                  // One shape at every width: the linked item, then its state.
                  <li key={item.key} className="grid min-w-0 text-body-sm">
                    <a
                      href={item.href}
                      className="min-w-0 truncate text-content-primary underline-offset-2 hover:text-content-link hover:underline"
                    >
                      {item.label}
                    </a>
                    <span className="text-content-muted">{item.state}</span>
                  </li>
                ))}
                {more > 0 ? (
                  <li className="text-body-sm">
                    <a href="#tasks-heading" className="text-content-link hover:underline">
                      and {more} more
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {group.action ? (
              <div>
                <a
                  href={group.action.href}
                  className="text-body-sm text-content-link underline-offset-2 hover:underline"
                >
                  {group.action.label}
                </a>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

const abandonReason = 'The provider contract was cancelled; single sign-on moves to next quarter.';

/** The save still running while the owner tries to close or abandon. */
const pendingWrite: BlockerItem = {
  key: 'write',
  href: taskHref('T-02'),
  label: (
    <>
      <span className="font-mono text-content-muted">T-02</span> task.md
    </>
  ),
  state: 'Saving since 16:38',
};

function CloseDialog({
  mode,
  list,
}: {
  mode: 'blocked' | 'ready' | 'after-abandon';
  list: readonly MockTask[];
}) {
  const open = list.filter(
    (item) => item.status !== 'cancelled' && item.workflow.position.kind !== 'terminal',
  );
  const cancelled = list.filter((item) => item.status === 'cancelled');
  const done = list.filter((item) => item.workflow.position.kind === 'terminal');
  const description =
    mode === 'blocked'
      ? `${specification.title} cannot close yet: its workflow is waiting for ${open.length} unfinished tasks and one document is still being saved.`
      : mode === 'after-abandon'
        ? `Abandoned today by Dominik: “${abandonReason}” Closing records it as not delivered and runs the repository checks.`
        : 'Everything required is finished. Closing also runs the repository checks.';

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {specification.title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {mode === 'ready' ? (
            <Alert tone="success" title="Ready to close">
              The {specification.workflow.title} workflow is complete and {done.length} tasks are
              done.
            </Alert>
          ) : null}
          <BlockerGroups
            groups={
              mode === 'blocked'
                ? [
                    {
                      title: 'Workflow',
                      count: 1,
                      explanation:
                        'Waiting for tasks ends by itself once every task is done or cancelled.',
                      items: [],
                      action: { label: 'See workflow', href: '#spec-workflow-heading' },
                    },
                    {
                      title: 'Unfinished tasks',
                      explanation: 'Finish, cancel or remove each one.',
                      items: taskItems(open),
                      action: { label: 'Go to Tasks', href: '#tasks-heading' },
                    },
                    {
                      title: 'Pending writes',
                      explanation: 'A save in progress; it settles by itself in a moment.',
                      items: [pendingWrite],
                    },
                  ]
                : [
                    {
                      title: 'Cancelled, not delivered',
                      explanation: 'Recorded as not delivered when the specification closes.',
                      items: taskItems(cancelled, (item) =>
                        mode === 'after-abandon' && item.id !== 'T-06'
                          ? item.started
                            ? 'Cancelled by abandon · its workflow ended as abandoned'
                            : 'Cancelled by abandon'
                          : 'Cancelled by Dominik · Yesterday',
                      ),
                    },
                  ]
            }
          />
          {mode === 'blocked' ? (
            // Opens the Abandon dialog (final, with its own reason and confirmation).
            <p className="text-body-sm text-content-secondary">
              Not going to finish this work?{' '}
              <a href="#abandon" className="text-content-link underline-offset-2 hover:underline">
                Abandon instead
              </a>
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {mode === 'blocked' ? (
            <Button autoFocus>Dismiss</Button>
          ) : (
            <>
              <Button variant="secondary">Cancel</Button>
              <Button>Close specification</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AbandonDialog({ blocked, list }: { blocked: boolean; list: readonly MockTask[] }) {
  const open = list.filter(
    (item) => item.status !== 'cancelled' && item.workflow.position.kind !== 'terminal',
  );
  const running = open.filter((item) => item.workflow.position.kind === 'active');

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abandon {specification.title}</DialogTitle>
          <DialogDescription>
            {blocked
              ? `${specification.title} cannot be abandoned yet: a save and an agent session are still running, and the branch has uncommitted changes.`
              : 'Ends the specification without delivering it. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5">
          {blocked ? (
            <BlockerGroups
              groups={[
                {
                  title: 'Pending writes',
                  explanation: 'A save in progress; it settles by itself in a moment.',
                  items: [pendingWrite],
                },
                {
                  title: 'Agent sessions',
                  explanation: 'A running agent session works on a task step. Stop it first.',
                  items: [
                    {
                      key: 'session',
                      href: '/sessions/implement-token-exchange',
                      label: 'Implement token exchange',
                      state: 'T-02 · implement · attempt 2 · running',
                    },
                  ],
                },
                {
                  title: 'Repository',
                  explanation: 'Commit or discard the changes on the branch first.',
                  items: [
                    {
                      key: 'git',
                      href: '#repository',
                      label: 'feature/single-sign-on',
                      state: '4 uncommitted files',
                    },
                  ],
                  action: { label: 'Go to Changes', href: '#changes' },
                },
              ]}
            />
          ) : (
            <>
              <div className="grid gap-1.5">
                <Typography as="h3" variant="label-sm">
                  What happens
                </Typography>
                <ul className="grid list-disc gap-1 pl-5 text-body-sm text-content-secondary">
                  <li>
                    The {specification.workflow.title} workflow ends as abandoned at Waiting for
                    tasks.
                  </li>
                  <li>
                    Active attempts end as abandoned, their work is kept:
                    <ul className="mt-1 grid gap-0.5 pl-4">
                      {running.map((item) =>
                        item.workflow.position.kind === 'active' ? (
                          <li key={item.id}>
                            <span className="font-mono">{item.id}</span> ·{' '}
                            {stepTitle(item.workflow.position.step)} · attempt{' '}
                            {item.workflow.position.attempt} · by {item.workflow.position.actor}
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </li>
                  <li>
                    {open.length} unfinished tasks are cancelled, including started ones:{' '}
                    {open.map((item) => item.id).join(', ')}.
                  </li>
                  <li>Nothing is marked delivered. Documents, tasks and history stay readable.</li>
                </ul>
              </div>
              <Field>
                <Field.Label>Reason (required)</Field.Label>
                <TextArea rows={3} defaultValue={abandonReason} />
                <Field.Description>
                  Shown on the specification and in its history.
                </Field.Description>
              </Field>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {blocked ? (
            <Button>Dismiss</Button>
          ) : (
            <>
              <Button variant="secondary">Cancel</Button>
              <Button variant="destructive">Abandon specification</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Workspace                                                                                     */
/* ------------------------------------------------------------------------------------------ */

const abandonedScenarios: readonly SpecificationScenario[] = ['abandoned', 'close-after-abandon'];

function Overview({
  scenario,
  list,
}: {
  scenario: SpecificationScenario;
  list: readonly MockTask[];
}) {
  const [creating, setCreating] = useState(scenario === 'create-task');
  const view = specWorkflow(scenario, list);
  const abandoned = abandonedScenarios.includes(scenario);

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
        status={
          abandoned ? (
            <InlineNote role="status" icon="archive">
              <span className="font-medium text-content-primary">{abandonReason}</span>{' '}
              <span className="text-content-muted">Dominik, today 16:40</span>
            </InlineNote>
          ) : undefined
        }
        primaryAction={
          view.position.kind === 'terminal' ? <Button>Close specification</Button> : undefined
        }
      />
      <TasksList list={list} onCreate={() => setCreating(true)} canCreate={!abandoned} />
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
      {scenario === 'close-blocked' ? <CloseDialog mode="blocked" list={list} /> : null}
      {scenario === 'close-ready' ? <CloseDialog mode="ready" list={list} /> : null}
      {scenario === 'close-after-abandon' ? <CloseDialog mode="after-abandon" list={list} /> : null}
      {scenario === 'abandon' ? <AbandonDialog blocked={false} list={list} /> : null}
      {scenario === 'abandon-blocked' ? <AbandonDialog blocked list={list} /> : null}
    </div>
  );
}

function Workspace({ scenario, width, historyOpen = false }: SpecificationMockProps) {
  const list = tasksFor(scenario);
  const hasHistory = scenario !== 'empty' && scenario !== 'authoring' && scenario !== 'create-task';
  const showHistory = hasHistory && historyOpen;
  const narrow = width < 730;
  const terminal = specWorkflow(scenario, list).position.kind === 'terminal';
  const actions: WorkspaceHeaderAction[] = [
    ...(hasHistory
      ? [
          {
            // The same toggle at every width; on Narrow it opens the history as a pushed page.
            id: 'history',
            label: 'Activity history',
            icon: 'clock',
            presentation: 'icon',
            direct: 'always',
            checked: showHistory && !narrow,
            onPress: noop,
          } as const,
        ]
      : []),
    { id: 'close', label: 'Close specification', onPress: noop },
    ...(terminal || scenario === 'empty'
      ? []
      : [
          {
            id: 'abandon',
            label: 'Abandon specification',
            tone: 'danger',
            onPress: noop,
          } as const,
        ]),
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
              <Overview scenario={scenario} list={list} />
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
        {showHistory && !narrow ? (
          <AppWorkspace.Secondary
            open
            onOpenChange={noop}
            header={<WorkspaceHeader title="Activity history" headingLevel={2} />}
          >
            <AppContent className="w-full">
              <AppWorkspaceBody>
                <WorkflowHistory
                  entries={
                    abandonedScenarios.includes(scenario)
                      ? [
                          {
                            step: 'wait-for-tasks',
                            attempt: 1,
                            actor: 'Dominik',
                            at: 'Today 16:40',
                            result: 'Abandoned',
                            toStep: null,
                            feedback: abandonReason,
                          },
                          ...specificationHistory,
                        ]
                      : specificationHistory
                  }
                  label="Activity history"
                />
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
