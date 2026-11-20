import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspace, AppWorkspaceProvider, WorkspaceHeader } from '@nevo/ui';
import type { TaskDocumentTree, TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { DocumentRelation, TaskAuthoring } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { withLocale } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { taskWorkflowProjection } from '../execution/projections.stories-support';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { TaskAuthoringApi } from './api';
import { contextView } from './context/contextModel';
import type { ContextNames } from './context/contextPresentation';
import { TaskContextSection } from './context/TaskContextSection';
import { TaskDocumentsSection } from './documents/TaskDocumentsSection';

/*
 * The Full Task's supporting sections on their own (Documents and Context): open when they hold
 * few items, collapsed with a summary above that, at every width; Context labels whether it shows
 * the Engine's default or the task's own list (the explanation on demand), says what the first
 * change of a default does where it happens, and "Use default context" names what it removes.
 */

const SPEC = 'sso';
const TASK = 'oidc-callback';
type Entry = TaskAuthoring['context']['entries'][number]['entry'];

const file = (revision: string) =>
  ({ kind: 'text', mediaType: 'text/markdown', size: 10, revision, editable: true }) as const;
const documentNames = ['task.md', 'plan.md', 'findings.md', 'screens.md', 'notes.md'];

/** With `states`: task.md written, the other documents still only their initial content. */
function documentTree(count: number, states = false): TaskDocumentTree {
  return {
    taskId: TASK,
    registryRevision: 'registry-1',
    capabilities: { save: true, organize: true },
    documents: documentNames.slice(0, count).map((path, index) => ({
      id: index === 0 ? 'task' : path.replace('.md', ''),
      path,
      type: index === 0 ? 'task' : 'notes',
      classification: 'registered' as const,
      required: index === 0,
      ...(states
        ? { contentState: index === 0 ? ('authored' as const) : ('baseline' as const) }
        : {}),
      file: file(`r${index}`),
    })),
  };
}

/**
 * How the Task's workflow uses its documents at Implement: task.md lacks the Verification section
 * its finish needs (it refuses Finish now), findings.md is needed to start Review.
 */
const taskRelations: DocumentRelation[] = [
  {
    scope: { kind: 'task', specId: SPEC, taskId: TASK },
    documentId: 'task',
    relation: 'needed-to-finish',
    blocksNow: true,
    step: { id: 'implement', title: 'Implement', active: true },
    gate: {
      id: 'verification',
      label: 'task.md has a Verification section',
      labelDeclared: true,
      documentType: 'task',
      requiredSections: ['Verification'],
      missingSections: ['Verification'],
    },
  },
  {
    scope: { kind: 'task', specId: SPEC, taskId: TASK },
    documentId: 'findings',
    relation: 'needed-to-start',
    blocksNow: false,
    step: { id: 'review', title: 'Review', active: false },
    gate: {
      id: 'findings',
      label: 'findings.md exists',
      labelDeclared: true,
      documentType: 'findings',
      requiredSections: [],
    },
  },
];

const names: ContextNames = {
  taskDocuments: new Map(documentNames.map((path) => [path.replace('.md', ''), path])),
  specificationDocuments: new Map([
    ['overview', 'overview.md'],
    ['ux', 'ux.md'],
    ['old-flow', 'old-flow.md'],
  ]),
};

const taskMd: Entry = { kind: 'task-document', id: 'task', required: true };
const overview: Entry = { kind: 'specification-document', id: 'overview', required: true };
const defaultEntries: Entry[] = [taskMd, overview];
const ownEntries: Entry[] = [
  taskMd,
  overview,
  { kind: 'specification-document', id: 'ux', required: true, note: 'The sign-in flow' },
  { kind: 'path', path: 'packages/specflow-runtime/src/auth/**', required: true },
  { kind: 'specification-document', id: 'old-flow', required: false },
  { kind: 'instructions', text: 'Keep the session cookie name unchanged.', required: true },
];

interface Scenario {
  readonly documents: number;
  readonly own: boolean;
  readonly editable: boolean;
  /** A short own list whose third entry is missing (required) or an awaited process artifact. */
  readonly problem?: 'missing-required' | 'awaited';
  /** Inside the application shell: Wide at a wide viewport (sections always expanded). */
  readonly shell?: boolean;
  /** The documents carry their content state and the Task's workflow relations. */
  readonly states?: boolean;
  /** With `states`: the Task's workflow has no document gates (no relations). */
  readonly noGates?: boolean;
  /** The task has started: Context says what it reads. */
  readonly started?: boolean;
}

const ux: Entry = { kind: 'specification-document', id: 'ux', required: true };
const findings: Entry = {
  kind: 'specification-document',
  id: 'findings',
  required: true,
  artifact: true,
};

function entriesOf({ own, problem }: Scenario): Entry[] {
  if (problem) {
    return [taskMd, overview, problem === 'awaited' ? findings : ux];
  }

  return own ? ownEntries : defaultEntries;
}

function authoring(scenario: Scenario): TaskAuthoring {
  return {
    context: {
      isDefault: !scenario.own && !scenario.problem,
      entries: entriesOf(scenario).map((entry) =>
        entry === findings
          ? { entry, state: 'awaited' as const }
          : (entry.kind === 'specification-document' && entry.id === 'old-flow') ||
              (entry === ux && scenario.problem === 'missing-required')
            ? { entry, state: 'unresolved' as const, reason: 'not-found' as const }
            : { entry, state: 'resolved' as const },
      ),
      defaultEntries,
    },
    dependencyCandidates: [],
  };
}

function resource(scenario: Scenario): TaskResourceFacts {
  // Before the first start the task has no run; started, its first step is active.
  const position = scenario.started
    ? ({ state: 'active', step: 'implement', attempt: 1 } as const)
    : ({ state: 'not-started' } as const);

  return {
    revision: 'rev-3',
    type: 'implementation',
    status: 'ready',
    dependsOn: [],
    origin: { kind: 'manual', actorId: 'user:demo' },
    documents: [{ id: 'task', path: 'task.md', type: 'task' }],
    context: scenario.own || scenario.problem ? entriesOf(scenario) : null,
    readiness: { kind: 'ready' },
    facts: {
      preparation: 'ready',
      escalated: false,
      position,
      startable: false,
      startBlockers: [],
      definitionChanged: false,
    },
    position,
    definitionChanged: false,
  };
}

function SupportSections(scenario: Scenario) {
  const setup = useMemo(() => {
    const never = () => new Promise<never>(() => undefined);
    const api: TaskAuthoringApi = {
      specificationActions: never,
      taskActions: scenario.states
        ? () =>
            Promise.resolve({
              ...taskWorkflowProjection('implement-gate'),
              documentRelations: scenario.noGates ? [] : taskRelations,
            })
        : never,
      createTask: never,
      editTask: (_spec, taskId) => Promise.resolve({ taskId, revision: 'rev-4' }),
      removeTask: never,
      setStatus: never,
      documentTree: () => Promise.resolve(documentTree(scenario.documents, scenario.states)),
      addDocuments: never,
      operateDocument: never,
      catalogue: never,
      searchProjectDocuments: never,
    };

    return {
      query: createSpecFlowQueryClient(),
      services: createSpecFlowAppServices({ taskAuthoringApi: api }),
    };
  }, [scenario.documents, scenario.states, scenario.noGates]);
  const task = resource(scenario);
  const view = contextView(task, authoring(scenario));

  const sections = (
    <div className="@container/task grid min-w-0 p-6">
      <TaskDocumentsSection
        specId={SPEC}
        taskId={TASK}
        ownContext={view.explicit}
        onOpenDocument={() => undefined}
      />
      <TaskContextSection
        specId={SPEC}
        specTitle="SSO sign-in"
        taskId={TASK}
        revision={task.revision}
        view={view}
        names={names}
        specificationDocuments={[
          { id: 'overview', title: 'SSO sign-in', filename: 'overview.md' },
          { id: 'ux', title: 'UX', filename: 'ux.md' },
        ]}
        editable={scenario.editable}
        openTarget={() => undefined}
        onLoadLatest={() => undefined}
        started={task.position.state !== 'not-started'}
      />
    </div>
  );

  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        {scenario.shell ? (
          <AppWorkspaceProvider>
            <AppShell navigation={<div className="p-4">SpecFlow</div>}>
              <AppWorkspace fit="available" split="primary">
                <AppWorkspace.Primary header={<WorkspaceHeader title="oidc-callback" />}>
                  {sections}
                </AppWorkspace.Primary>
              </AppWorkspace>
            </AppShell>
          </AppWorkspaceProvider>
        ) : (
          sections
        )}
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'SpecFlow/Tasks/Full Task sections',
  component: SupportSections,
  decorators: [withLocale('en')],
  parameters: { layout: 'fullscreen' },
  args: { documents: 1, own: false, editable: true, shell: false },
} satisfies Meta<typeof SupportSections>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One document and the two default entries: both sections open, Context labelled "Default". */
export const FewItemsDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /task\.md/ });
    await expect(canvas.getByText('2 entries')).toBeVisible();
    await expect(canvas.getByText('Default context')).toBeVisible();
    await expect(canvas.queryByText(/Your first change/)).toBeNull();
    await expect(canvas.getByText('overview.md')).toBeVisible();
  },
};

/** The default's explanation, opened from the label: what it follows and what the first change does. */
export const DefaultExplanation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'About the default context' }));
    const popover = await page.findByRole('dialog');
    await expect(popover).toHaveTextContent('New task documents join it by themselves.');
    await expect(popover).toHaveTextContent("Your first change saves it as this task's own list.");
  },
};

/** The row menu of a default entry says what a change there does, before it is chosen. */
export const DefaultRowMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Actions for overview.md' }));
    const menu = await page.findByRole('menu');
    const note = within(menu).getByText(/^A change here saves the context/);
    // The menu fades in: wait for it, then the note is read without scrolling.
    await waitFor(() => expect(note).toBeVisible());
    await expect(menu).toHaveAttribute('aria-describedby', note.id);
  },
};

/** The Add dialog over a default list says what adding does first, above its fields. */
export const DefaultAddDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Add context' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Code path' }));
    const dialog = await page.findByRole('dialog');
    const note = within(dialog).getByText(
      /^Adding this saves the context as this task's own list\./,
    );
    await expect(note).toBeVisible();
    // It precedes every field of the form.
    const field = dialog.querySelector('form input, form textarea');
    await expect(
      Boolean(note.compareDocumentPosition(field as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  },
};

/** Five documents and six own entries: both start collapsed, their headers summarise them. */
export const ManyItemsOwnList: Story = {
  args: { documents: 5, own: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await canvas.findByText('5 · task.md, plan.md, +3');
    await expect(canvas.getByText('6 entries · own list · 1 optional missing')).toBeVisible();
    await expect(canvas.queryByText('Own context list')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: /Context/ }));
    await expect(await canvas.findByText('Own context list')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'About this context list' }));
    const popover = await page.findByRole('dialog');
    await expect(popover).toHaveTextContent(
      'New task documents are not added to it by themselves.',
    );
    await expect(popover).toHaveTextContent('Choose “Use default context” in the + menu');
  },
};

/** The default context, read-only: the explanation without the first-change sentence. */
export const DefaultNotEditable: Story = {
  args: { editable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'About the default context' }));
    const popover = await page.findByRole('dialog');
    await expect(popover).toHaveTextContent('It follows this task');
    await expect(popover).not.toHaveTextContent('Your first change');
  },
};

/**
 * A started task (its first step active): the explanation says what the task reads. Its context
 * stays editable until it ends, so + and the first-change sentence remain.
 */
export const StartedTask: Story = {
  args: { started: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    // A started task's context stays editable (until it ends): + and the row menus remain.
    await expect(canvas.getByRole('button', { name: 'Add context' })).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: 'About the default context' }));
    const popover = await page.findByRole('dialog');
    await expect(popover).toHaveTextContent('Inputs this task reads, in order.');
    await expect(popover).not.toHaveTextContent('before it starts');
    await expect(popover).toHaveTextContent("Your first change saves it as this task's own list.");
  },
};

/** "Use default context" confirms first and names the own entries the default does not hold. */
export const UseDefaultConfirm: Story = {
  args: { documents: 2, own: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    // The `+` sits in the header: it works whether or not the section is collapsed.
    await userEvent.click(await canvas.findByRole('button', { name: 'Add context' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Use default context' }));
    const dialog = await page.findByRole('dialog');
    await expect(dialog).toHaveTextContent('Use the default context?');
    await expect(dialog).toHaveTextContent(
      'Entries you added will be removed: ux.md, packages/specflow-runtime/src/auth/**, old-flow.md, +1.',
    );
  },
};

/** With an own list, a new document does not join the context, and the dialog says so. */
export const NewDocumentOwnList: Story = {
  args: { documents: 2, own: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'New document' }));
    await waitFor(() =>
      expect(page.getByRole('dialog')).toHaveTextContent(
        'It is not added to the context, because this task has its own list.',
      ),
    );
  },
};

/** A required entry that does not resolve: the reason is on the row, the note names it. */
export const MissingRequiredEntry: Story = {
  args: { problem: 'missing-required' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Not found · required')).toBeVisible();
    await expect(canvas.getByText('1 required entry is missing: ux.md.')).toBeVisible();
  },
};

/** An awaited process artifact: expected, quiet, and says when it is needed. */
export const AwaitedEntry: Story = {
  args: { problem: 'awaited' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Awaited · needed to start')).toBeVisible();
  },
};

/**
 * The shared document state label on Task documents: the relation to the Task's active step ("this
 * step", Now is beside it) and the content state, each named only when it applies.
 */
export const DocumentStates: Story = {
  args: { documents: 3, states: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Needed to finish this step')).toBeVisible();
    await expect(canvas.getByText('Initial content only')).toBeVisible();
    await expect(canvas.getByText('Initial content only · needed to start Review')).toBeVisible();
  },
};

/** A Task workflow without document gates (the shipped ones): content states only. */
export const DocumentStatesWithoutGates: Story = {
  args: { documents: 3, states: true, noGates: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByText('Initial content only')).toHaveLength(2);
    await expect(canvas.queryByText(/needed to|used in/i)).toBeNull();
  },
};
