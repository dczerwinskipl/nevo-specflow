import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspace, AppWorkspaceProvider, WorkspaceHeader } from '@nevo/ui';
import type { TaskDocumentTree, TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { TaskAuthoring } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { withLocale } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { TaskAuthoringApi } from './api';
import { contextView } from './context/contextModel';
import type { ContextNames } from './context/contextPresentation';
import { TaskContextSection } from './context/TaskContextSection';
import { TaskDocumentsSection } from './documents/TaskDocumentsSection';

/*
 * The Full Task's supporting sections on their own (Documents and Context): open when they hold
 * few items, collapsed with a summary above that, at every width; Context says whether it shows
 * the Engine's default or the task's own list, and "Use default context" names what it removes.
 */

const SPEC = 'sso';
const TASK = 'oidc-callback';
type Entry = TaskAuthoring['context']['entries'][number]['entry'];

const file = (revision: string) =>
  ({ kind: 'text', mediaType: 'text/markdown', size: 10, revision, editable: true }) as const;
const documentNames = ['task.md', 'plan.md', 'findings.md', 'screens.md', 'notes.md'];

function documentTree(count: number): TaskDocumentTree {
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
      file: file(`r${index}`),
    })),
  };
}

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
      position: { state: 'active', step: 'implement', attempt: 1 },
      startable: false,
      startBlockers: [],
      definitionChanged: false,
    },
    position: { state: 'active', step: 'implement', attempt: 1 },
    definitionChanged: false,
  };
}

function SupportSections(scenario: Scenario) {
  const setup = useMemo(() => {
    const never = () => new Promise<never>(() => undefined);
    const api: TaskAuthoringApi = {
      specificationActions: never,
      taskActions: never,
      createTask: never,
      editTask: (_spec, taskId) => Promise.resolve({ taskId, revision: 'rev-4' }),
      removeTask: never,
      setStatus: never,
      documentTree: () => Promise.resolve(documentTree(scenario.documents)),
      addDocuments: never,
      operateDocument: never,
      catalogue: never,
      searchProjectDocuments: never,
    };

    return {
      query: createSpecFlowQueryClient(),
      services: createSpecFlowAppServices({ taskAuthoringApi: api }),
    };
  }, [scenario.documents]);
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
  args: { documents: 1, own: false, editable: true },
} satisfies Meta<typeof SupportSections>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One document and the two default entries: both sections open, the first change explained. */
export const FewItemsDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /task\.md/ });
    await expect(canvas.getByText('2 entries · default')).toBeVisible();
    await expect(canvas.getByText(/Your first change saves it/)).toBeVisible();
    await expect(canvas.getByText('overview.md')).toBeVisible();
  },
};

/** Five documents and six own entries: both start collapsed, their headers summarise them. */
export const ManyItemsOwnList: Story = {
  args: { documents: 5, own: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('5 · task.md, plan.md, +3');
    await expect(canvas.getByText('6 entries · own list · 1 optional missing')).toBeVisible();
    await expect(canvas.queryByText(/Own list\./)).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: /Context/ }));
    await expect(await canvas.findByText(/New task documents are not added/)).toBeVisible();
  },
};

/** The default context, read-only: the source line without the first-change sentence. */
export const DefaultNotEditable: Story = {
  args: { editable: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/It follows this task/)).toBeVisible();
    await expect(canvas.queryByText(/Your first change/)).toBeNull();
  },
};

/** "Use default context" confirms first and names the own entries the default does not hold. */
export const UseDefaultConfirm: Story = {
  args: { documents: 2, own: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: /Context/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add context' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Use default context' }));
    const dialog = await page.findByRole('dialog');
    await expect(dialog).toHaveTextContent('Use the default context?');
    await expect(dialog).toHaveTextContent(
      'Entries you added are removed: ux.md, packages/specflow-runtime/src/auth/**, old-flow.md, +1.',
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
    await expect(await canvas.findByText('Awaited · needed when the step starts')).toBeVisible();
  },
};
