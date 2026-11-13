import { type ReactNode } from 'react';
import {
  AccentBlock,
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Button,
  Icon,
  IconButton,
  InformationList,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuNote,
  MenuSeparator,
  MenuTrigger,
  Progress,
  TextInput,
  Typography,
  WorkspaceHeader,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { OperationalRow } from '../../shared/operational-list';
import type { SemanticSupporting } from '../../shared/operational-list/OperationalRow.types';
import { WorkspaceSection } from '../../shared/workspace-section';
import { SessionProviderIcon } from '../../features/sessions/shared/SessionProviderIcon';
import { MockNavigation } from '../editor-mode/MockNavigation.stories-support';
import {
  specification,
  task,
  taskProgress,
  tasks,
  type MockTask,
} from './fixtures.stories-support';
import { TasksList } from './SpecificationMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md,
 * "Specification Overview as control center"). Static fixtures shaped like the workflow action
 * projection; no branching on step ids or status names: each Requires attention row carries the
 * action the projection offers, and a `wait` step never gets an invented primary action.
 */

export type OverviewState =
  'empty' | 'active' | 'waiting' | 'blocked' | 'completed' | 'abandoned' | 'no-task-workflow';

/** A: Now, attention and Active tasks in the work column. B: Active tasks moves beside Sessions. */
export type OverviewColumns = 'work' | 'split';

export interface ControlCenterMockProps {
  width: number;
  height?: number;
  state: OverviewState;
  page?: 'overview' | 'tasks';
  columns?: OverviewColumns;
}

const noop = () => undefined;

/* ------------------------------------------------------------------------------------------ */
/* Projection-shaped fixtures                                                                   */
/* ------------------------------------------------------------------------------------------ */

interface NowView {
  /** The step title (primary) or the position name when there is no step. */
  readonly title: string;
  readonly kind: 'not-started' | 'work' | 'wait' | 'completed' | 'abandoned';
  /** The quiet line: attempt, since, by whom, step id and workflow revision. */
  readonly detail: string;
  readonly status?: ReactNode;
  readonly gate?: { label: string; detail: string; action: string };
  readonly primary?: string;
  /** Workflow operations offered by the projection that are not the main action. */
  readonly operations: readonly string[];
  readonly progress?: boolean;
  /** Technical detail for the ⋯ menu: step id and workflow revision. */
  readonly technical?: string;
  /** A terminal summary of the Tasks instead of the progress line. */
  readonly summary?: string;
}

interface AttentionItem {
  readonly key: string;
  readonly title: string;
  readonly subject: string;
  readonly reason: SemanticSupporting;
  /** The action the projection offers for it (never derived from a status name). */
  readonly action: string;
  readonly session?: boolean;
}

interface SessionItem {
  readonly key: string;
  readonly title: string;
  readonly facts: string;
  readonly status: SemanticSupporting;
}

interface StateData {
  readonly list: readonly MockTask[];
  readonly now: NowView;
  readonly attention: readonly AttentionItem[];
  readonly sessions: readonly SessionItem[];
  /** The workflow can produce Tasks (some step `produces: tasks`) or Tasks exist. */
  readonly hasTasks: boolean;
  readonly workflowTitle: string;
}

const preparing: readonly MockTask[] = [task('T-07'), task('T-04'), task('T-05')];

/**
 * Engine-derived attention (`deriveAttention`): a ready Task whose own step finished and whose
 * next attempt waits for the owner (`owner-action`). Never a Task just because it is ready or a
 * draft.
 */
const reworkT02: AttentionItem = {
  key: 'T-02',
  title: 'Token exchange endpoint and session cookie',
  subject: 'T-02 · Backend',
  reason: {
    text: 'Review asked for changes · the next Implementation attempt is yours to start',
    tone: 'attention',
    icon: 'triangle-alert',
  },
  action: 'Start Implementation',
};
/** A broken Task (files inconsistent): attention with the restore path. */
const brokenT07: AttentionItem = {
  key: 'T-07',
  title: 'Rate-limit session refresh',
  subject: 'T-07 · Backend',
  reason: {
    text: 'Broken: its files are inconsistent · restore them from Git',
    tone: 'danger',
    icon: 'circle-alert',
  },
  action: 'Open task',
};
const sessionQuestion: AttentionItem = {
  key: 'session-review',
  title: 'Review security scenarios',
  subject: 'Session · Claude',
  reason: { text: 'Asks: keep the return URL in the state parameter?', icon: 'chat' },
  action: 'Answer',
  session: true,
};
const workingSession: SessionItem = {
  key: 'session-impl',
  title: 'Implement token exchange',
  facts: '1 h ago · Codex · T-02',
  status: { text: 'Idle' },
};
const idleSession: SessionItem = {
  key: 'session-spec',
  title: 'Specification draft',
  facts: 'Yesterday · Claude',
  status: { text: 'Idle' },
};

function finished(list: readonly MockTask[]): readonly MockTask[] {
  return list.map((item) =>
    item.status === 'cancelled'
      ? item
      : {
          ...item,
          status: 'ready' as const,
          started: true,
          workflow: {
            ...item.workflow,
            position: { kind: 'terminal' as const, summary: 'Completed', at: 'Today' },
          },
        },
  );
}

function dataFor(state: OverviewState): StateData {
  const workflowTitle = `${specification.workflow.title} rev ${specification.workflow.revision}`;
  switch (state) {
    case 'empty':
      return {
        list: [],
        hasTasks: true,
        workflowTitle,
        now: {
          title: 'Not started',
          kind: 'not-started',
          detail: 'First step Requirements',
          technical: workflowTitle,
          primary: 'Start workflow',
          operations: [],
        },
        attention: [],
        sessions: [],
      };
    case 'active':
      return {
        list: preparing,
        hasTasks: true,
        workflowTitle,
        now: {
          title: 'Requirements',
          kind: 'work',
          detail: 'Attempt 1 · in progress since 09:05 · started by you',
          technical: `Step requirements · ${workflowTitle}`,
          primary: 'Finish step',
          operations: [],
        },
        attention: [],
        sessions: [idleSession],
      };
    case 'blocked':
      return {
        list: [
          ...preparing.filter((item) => item.id !== 'T-04'),
          {
            ...task('T-04'),
            status: 'ready',
            workflow: { ...task('T-04').workflow, unavailableReason: undefined },
          },
        ],
        hasTasks: true,
        workflowTitle,
        now: {
          title: 'Specification',
          kind: 'work',
          detail: 'Attempt 2 · in progress since 10:20 · started by you',
          technical: `Step specification · ${workflowTitle}`,
          gate: {
            label: 'An Acceptance section in specification.md',
            detail: 'missing',
            action: 'Open specification.md',
          },
          // Every result of this step needs the gate: the gate's action is the main action and
          // Finish step waits in the menu, unavailable with its reason.
          primary: 'Open specification.md',
          operations: [
            'Finish step · unavailable until the Acceptance section exists',
            'Return to Requirements',
          ],
        },
        attention: [brokenT07, sessionQuestion],
        sessions: [idleSession],
      };
    case 'completed':
      return {
        list: finished(tasks),
        hasTasks: true,
        workflowTitle,
        now: {
          title: 'Completed',
          kind: 'completed',
          detail: 'Waiting for tasks ended today 16:40',
          technical: workflowTitle,
          summary: 'All 6 tasks done · 1 cancelled',
          primary: 'Close specification',
          operations: [],
        },
        attention: [],
        sessions: [],
      };
    case 'abandoned':
      return {
        list: tasks.map((item) =>
          item.workflow.position.kind === 'terminal' || item.status === 'cancelled'
            ? item
            : { ...item, status: 'cancelled' as const },
        ),
        hasTasks: true,
        workflowTitle,
        now: {
          title: 'Abandoned',
          kind: 'abandoned',
          detail: 'Abandoned while waiting for tasks · today 16:40 by Dominik',
          technical: workflowTitle,
          // The reason under the title; one archive icon (on the title).
          status: (
            <Typography as="p" variant="body-sm" className="text-content-primary">
              The provider contract was cancelled; single sign-on moves to next quarter.
            </Typography>
          ),
          summary: '6 tasks cancelled · 1 done',
          primary: 'Close specification',
          operations: [],
        },
        attention: [],
        sessions: [],
      };
    case 'no-task-workflow':
      // A Specification workflow without Tasks (no step produces them): the Tasks preview is
      // omitted, the work itself is the workflow's own steps.
      return {
        list: [],
        hasTasks: false,
        workflowTitle: 'Small change rev 1',
        now: {
          title: 'Review',
          kind: 'work',
          detail: 'Attempt 1 · in progress since 14:10 · started by Dominik',
          technical: 'Step review · Small change rev 1',
          primary: 'Finish step',
          operations: ['Return to Implementation'],
        },
        attention: [],
        sessions: [workingSession],
      };
    default:
      return {
        list: tasks.map((item) =>
          item.id === 'T-02'
            ? {
                ...item,
                workflow: {
                  ...item.workflow,
                  position: { kind: 'ready' as const, step: 'implement', attempt: 2 },
                },
              }
            : item,
        ),
        hasTasks: true,
        workflowTitle,
        now: {
          title: 'Waiting for tasks',
          kind: 'wait',
          detail: 'Continues by itself when every task is done or cancelled',
          technical: `Step wait-for-tasks · ${workflowTitle}`,
          progress: true,
          operations: ['Return to Breakdown'],
        },
        attention: [reworkT02, sessionQuestion],
        sessions: [workingSession, idleSession],
      };
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Now                                                                                          */
/* ------------------------------------------------------------------------------------------ */

function Now({ now, list }: { now: NowView; list: readonly MockTask[] }) {
  const progress = taskProgress(list);
  const terminalIcon =
    now.kind === 'completed' ? 'circle-check' : now.kind === 'abandoned' ? 'archive' : undefined;

  return (
    <AccentBlock role="region" aria-labelledby="ovw-now-heading">
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <Typography as="h2" variant="section-label" id="ovw-now-heading">
            Now
          </Typography>
          {now.operations.length > 0 || now.technical ? (
            // Workflow operations that are not the main action (Return, …): one quiet menu.
            <Menu modal={false}>
              <MenuTrigger asChild>
                <IconButton
                  icon="ellipsis"
                  size="sm"
                  variant="ghost"
                  aria-label="Workflow operations"
                />
              </MenuTrigger>
              <MenuContent align="end">
                {now.operations.map((operation) =>
                  operation.includes('unavailable') ? (
                    <MenuItem key={operation} disabled onSelect={noop}>
                      {operation}
                    </MenuItem>
                  ) : (
                    <MenuItem key={operation} onSelect={noop}>
                      {operation}
                    </MenuItem>
                  ),
                )}
                {now.operations.length > 0 ? <MenuSeparator /> : null}
                <MenuItem onSelect={noop}>Workflow history</MenuItem>
                {now.technical ? <MenuNote id="ovw-now-technical">{now.technical}</MenuNote> : null}
              </MenuContent>
            </Menu>
          ) : null}
        </div>
        <div className="grid gap-0.5" aria-live="polite">
          <Typography
            as="p"
            variant="title-sm"
            className={now.kind === 'completed' ? 'text-status-success' : undefined}
          >
            {terminalIcon ? (
              <span className="mr-1 inline-flex h-[1lh] items-center align-top">
                <Icon name={terminalIcon} size="sm" aria-hidden="true" />
              </span>
            ) : null}
            {now.title}
          </Typography>
          {now.status}
          <Typography as="p" variant="body-sm" className="text-content-muted">
            {now.detail}
          </Typography>
        </div>
        {now.summary ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {now.summary}
          </Typography>
        ) : null}
        {now.progress && progress.total > 0 ? (
          <div className="grid max-w-md gap-1.5">
            <Progress
              variant="segmented"
              completed={progress.done}
              total={progress.total}
              aria-labelledby="ovw-progress"
            />
            <Typography
              as="p"
              variant="body-sm"
              id="ovw-progress"
              className="text-content-secondary"
            >
              Tasks {progress.text}
              <span className="block text-content-muted">
                The bar counts every task except cancelled ones.
              </span>
            </Typography>
          </div>
        ) : null}
        {now.gate ? (
          <div className="grid gap-1.5">
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              To finish:
            </Typography>
            <InlineNote tone="attention" icon="circle-alert">
              <span className="font-medium text-content-primary">{now.gate.label}</span> ·{' '}
              {now.gate.detail}
            </InlineNote>
          </div>
        ) : null}
        {now.primary ? (
          <div className="flex flex-wrap gap-2" data-slot="workflow-actions">
            <Button>{now.primary}</Button>
            {now.gate ? (
              <Typography as="p" variant="body-sm" className="self-center text-content-secondary">
                Finish step becomes available once this is met.
              </Typography>
            ) : null}
          </div>
        ) : null}
      </div>
    </AccentBlock>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Sections                                                                                     */
/* ------------------------------------------------------------------------------------------ */

const ATTENTION_SHOWN = 5;

function RequiresAttention({
  items,
  narrow,
}: {
  items: readonly AttentionItem[];
  narrow: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  const shown = items.slice(0, ATTENTION_SHOWN);

  return (
    <WorkspaceSection aria-labelledby="ovw-attention-heading">
      <WorkspaceSection.Header
        id="ovw-attention-heading"
        title="Requires attention"
        icon="triangle-alert"
        count={items.length}
      />
      <InformationList>
        {shown.map((item) => (
          <OperationalRow
            key={item.key}
            primary={item.title}
            onPrimaryClick={noop}
            factsLayout="inline"
            compactFacts={[item.subject]}
            supporting={
              narrow ? (
                // Narrow: the title and reason take the full width; the action follows them.
                <span className="grid gap-2">
                  <span
                    className={
                      item.reason.tone === 'danger'
                        ? 'font-medium text-status-danger'
                        : item.reason.tone === 'attention'
                          ? 'font-medium text-status-attention'
                          : undefined
                    }
                  >
                    {item.reason.text}
                  </span>
                  <span>
                    <Button size="sm" variant="secondary">
                      {item.action}
                    </Button>
                  </span>
                </span>
              ) : (
                item.reason
              )
            }
            leading={
              item.session ? (
                <SessionProviderIcon providerId="claude" />
              ) : (
                <span className="flex items-center justify-center text-content-muted">
                  <Icon name="list-checks" size="sm" aria-hidden="true" />
                </span>
              )
            }
            trailing={
              narrow ? undefined : (
                <Button size="sm" variant="secondary">
                  {item.action}
                </Button>
              )
            }
          />
        ))}
      </InformationList>
      {items.length > ATTENTION_SHOWN ? (
        <Button variant="ghost" size="sm" className="w-fit">
          Show {items.length - ATTENTION_SHOWN} more
        </Button>
      ) : null}
    </WorkspaceSection>
  );
}

type Lane =
  | 'needs-approval'
  | 'in-progress'
  | 'ready'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'held'
  | 'cancelled';

/** The Engine's lane of a Task (`laneOf`): a classification of its state, not a presentation. */
function laneOf(item: MockTask): Lane {
  const position = item.workflow.position;
  if (item.status === 'cancelled') {
    return 'cancelled';
  }

  if (position.kind === 'terminal') {
    return 'done';
  }

  if (item.status === 'draft') {
    return 'needs-approval';
  }

  if (item.status === 'on-hold') {
    return 'held';
  }

  if (item.started) {
    return 'in-progress';
  }

  return position.kind === 'waiting' ? 'waiting' : 'ready';
}

/**
 * The default grouping: presentation configuration over lanes (today the Runtime's `GROUPS`).
 * A project may later define its own groups over workflow positions; the UI only renders them.
 */
const defaultGrouping: readonly { id: string; name: string; lanes: readonly Lane[] }[] = [
  { id: 'needs-approval', name: 'Needs approval', lanes: ['needs-approval'] },
  { id: 'in-progress', name: 'In progress', lanes: ['in-progress'] },
  { id: 'ready', name: 'Ready to start', lanes: ['ready'] },
  { id: 'waiting', name: 'Waiting', lanes: ['waiting', 'blocked'] },
  { id: 'done', name: 'Done', lanes: ['done'] },
  { id: 'held', name: 'On hold or cancelled', lanes: ['held', 'cancelled'] },
];

/**
 * The Overview's Tasks: one row per non-empty group of the configured grouping (count, a few
 * titles), each opening the Tasks page at that group. A Task in Requires attention is counted but
 * not named here, so no Task is shown twice.
 */
function TaskGroupsSummary({
  list,
  attentionKeys,
}: {
  list: readonly MockTask[];
  attentionKeys: ReadonlySet<string>;
}) {
  const rows = defaultGrouping
    .map((group) => ({ group, members: list.filter((item) => group.lanes.includes(laneOf(item))) }))
    .filter((row) => row.members.length > 0);
  if (rows.length === 0) {
    return null;
  }

  return (
    <WorkspaceSection aria-labelledby="ovw-tasks-heading">
      <WorkspaceSection.Header id="ovw-tasks-heading" title="Tasks" icon="list-checks" />
      <InformationList>
        {rows.map(({ group, members }) => {
          const named = members.filter((item) => !attentionKeys.has(item.id));
          const shown = named.slice(0, 2).map((item) => `${item.id} ${item.title}`);
          const rest = members.length - shown.length;
          const text =
            shown.length > 0
              ? `${shown.join(' · ')}${rest > 0 ? ` · ${rest} more` : ''}`
              : `${rest} in Requires attention`;

          return (
            <OperationalRow
              key={group.id}
              primary={group.name}
              onPrimaryClick={noop}
              primaryAriaLabel={`${group.name}: open on the Tasks page`}
              supporting={
                <span className="block truncate">
                  <span className="font-medium text-content-primary">{members.length}</span> ·{' '}
                  {text}
                </span>
              }
            />
          );
        })}
      </InformationList>
      <Button variant="ghost" size="sm" className="w-fit">
        View all tasks
      </Button>
    </WorkspaceSection>
  );
}

function Sessions({ items }: { items: readonly SessionItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <WorkspaceSection aria-labelledby="ovw-sessions-heading">
      <WorkspaceSection.Header
        id="ovw-sessions-heading"
        title="Sessions"
        icon="chat"
        actions={
          <Button variant="ghost" size="sm">
            All sessions
          </Button>
        }
      />
      <InformationList>
        {items.map((item) => (
          <OperationalRow
            key={item.key}
            leading={
              <SessionProviderIcon providerId={item.key === 'session-impl' ? 'codex' : 'claude'} />
            }
            primary={item.title}
            onPrimaryClick={noop}
            factsLayout="inline"
            compactFacts={[item.facts]}
            supporting={item.status}
          />
        ))}
      </InformationList>
    </WorkspaceSection>
  );
}

function Documents() {
  return (
    <WorkspaceSection aria-labelledby="ovw-documents-heading">
      <WorkspaceSection.Header
        id="ovw-documents-heading"
        title="Documents"
        icon="file"
        count={5}
        actions={
          <Button variant="ghost" size="sm">
            All documents
          </Button>
        }
      />
      <InformationList>
        {['specification.md', 'requirements.md', 'ux.md'].map((name) => (
          <OperationalRow
            key={name}
            primary={name}
            onPrimaryClick={noop}
            factsLayout="inline"
            compactFacts={['Edited yesterday']}
          />
        ))}
      </InformationList>
    </WorkspaceSection>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Pages                                                                                        */
/* ------------------------------------------------------------------------------------------ */

function Overview({
  state,
  width,
  columns,
}: Required<Omit<ControlCenterMockProps, 'height' | 'page'>>) {
  const data = dataFor(state);
  const attentionKeys = new Set(data.attention.map((item) => item.key));
  const now = <Now now={data.now} list={data.list} />;
  const attention = <RequiresAttention items={data.attention} narrow={width === 0} />;
  const active = data.hasTasks ? (
    <TaskGroupsSummary list={data.list} attentionKeys={attentionKeys} />
  ) : null;
  const sessions = <Sessions items={data.sessions} />;
  const documents = <Documents />;
  // The existing rule: two columns from 1408 px of Overview content width. Here, the frame width
  // minus the persistent navigation stands in for the measured content width.
  const twoColumns = width - 300 >= 1408;
  const summary = (
    <div className="grid gap-1">
      <Typography as="h1" variant="title-lg">
        {specification.title}
      </Typography>
      <Typography as="p" variant="body-md" className="text-content-secondary">
        {specification.description}
      </Typography>
    </div>
  );

  if (!twoColumns) {
    return (
      <div className="grid max-w-content-standard gap-6">
        {summary}
        {now}
        {attention}
        {active}
        {sessions}
        {documents}
      </div>
    );
  }

  const work = columns === 'work' ? [now, attention, active] : [now, attention];
  const context = columns === 'work' ? [sessions, documents] : [active, sessions, documents];

  return (
    <div className="grid gap-6">
      {summary}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] items-start gap-x-8">
        <div className="grid gap-6">{work}</div>
        <div className="grid gap-6">{context}</div>
      </div>
    </div>
  );
}

function TasksPage({ state }: { state: OverviewState }) {
  const data = dataFor(state);

  return (
    <div className="grid gap-4">
      <div className="grid max-w-content-standard gap-3">
        <TextInput
          aria-label="Filter tasks"
          placeholder="Filter by id or title"
          className="max-w-sm"
        />
      </div>
      <TasksList
        list={data.list}
        onCreate={noop}
        selectable={false}
        attention={
          new Map(
            data.attention
              .filter((item) => !item.session)
              .map((item) => [item.key, item.reason.text] as const),
          )
        }
      />
    </div>
  );
}

function Workspace({
  state,
  width,
  page,
  columns,
}: Required<Omit<ControlCenterMockProps, 'height'>>) {
  const narrow = width < 730;
  const actions: WorkspaceHeaderAction[] =
    page === 'overview'
      ? [
          {
            id: 'history',
            label: 'Activity history',
            icon: 'clock',
            presentation: 'icon',
            direct: 'always',
            onPress: noop,
          },
          { id: 'close', label: 'Close specification', onPress: noop },
          ...(state === 'completed' || state === 'abandoned'
            ? []
            : [
                {
                  id: 'abandon',
                  label: 'Abandon specification',
                  tone: 'danger',
                  onPress: noop,
                } as const,
              ]),
        ]
      : [];

  return (
    <AppWorkspaceProvider scopeKey={`control-center-${page}`}>
      <AppWorkspace fit="available" labels={{ backToPrimary: 'Back', closeSecondary: 'Close' }}>
        <AppWorkspace.Primary
          header={
            <WorkspaceHeader
              title={page === 'overview' ? 'Overview' : 'Tasks'}
              actions={actions}
              labels={{ moreActions: 'More actions' }}
            />
          }
        >
          <AppContent className="w-full max-w-full">
            <AppWorkspaceBody>
              {page === 'overview' ? (
                <Overview state={state} width={narrow ? 0 : width} columns={columns} />
              ) : (
                <TasksPage state={state} />
              )}
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}

export function ControlCenterMock({
  width,
  height = 900,
  state,
  page = 'overview',
  columns = 'work',
}: ControlCenterMockProps): ReactNode {
  return (
    <StoryLocalization locale="en">
      <div style={{ width, height }} data-mock-frame={width}>
        <AppShell
          navigation={<MockNavigation current={page === 'overview' ? 'overview' : 'tasks'} />}
          style={{ height: '100%' }}
          labels={{ navigationTitle: 'Specification navigation' }}
        >
          <Workspace
            key={`${state}-${page}-${columns}-${width}`}
            state={state}
            width={width}
            page={page}
            columns={columns}
          />
        </AppShell>
      </div>
    </StoryLocalization>
  );
}
