// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import {
  SPEC,
  TASK,
  fakeTaskAuthoringApi,
  refusal,
  renderWithAuthoring,
  resourceFixture,
} from '../authoring.test-support';
import type { TaskAuthoring } from '@nevo/specflow-contracts/workflow';
import type { TaskAuthoringApi } from '../api';
import { contextView } from './contextModel';
import { TaskContextSection } from './TaskContextSection';

afterEach(cleanup);

const names = {
  taskDocuments: new Map([
    ['task', 'task.md'],
    ['screens', 'screens.md'],
  ]),
  specificationDocuments: new Map([
    ['overview', 'overview.md'],
    ['ux', 'ux.md'],
    ['old-flow', 'old-flow.md'],
  ]),
};

type EntryState = TaskAuthoring['context']['entries'][number];
const resolved = (entry: EntryState['entry']): EntryState => ({ entry, state: 'resolved' });

/** The Engine's default context of the fixture Task (no explicit list). */
const defaultAuthoring: TaskAuthoring = {
  context: {
    isDefault: true,
    entries: [
      resolved({ kind: 'task-document', id: 'task', required: true }),
      resolved({ kind: 'task-document', id: 'screens', required: true }),
      resolved({ kind: 'specification-document', id: 'overview', required: true }),
    ],
    defaultEntries: [
      { kind: 'task-document', id: 'task', required: true },
      { kind: 'task-document', id: 'screens', required: true },
      { kind: 'specification-document', id: 'overview', required: true },
    ],
  },
  dependencyCandidates: [],
};

function renderSection(
  api: TaskAuthoringApi,
  resource: TaskResourceFacts = resourceFixture(),
  authoring: TaskAuthoring = defaultAuthoring,
  started = false,
) {
  renderWithAuthoring(
    <TaskContextSection
      specId={SPEC}
      specTitle="Single sign-on"
      taskId={TASK}
      revision={resource.revision}
      view={contextView(resource, authoring)}
      names={names}
      specificationDocuments={[
        { id: 'overview', title: 'Overview', filename: 'overview.md' },
        { id: 'ux', title: 'UX', filename: 'ux.md' },
      ]}
      editable
      openTarget={() => undefined}
      onLoadLatest={vi.fn()}
      started={started}
    />,
    api,
  );
}

function addSpecificationDocument(title: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Specification document' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: title }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add to context' }));

  return dialog;
}

describe('TaskContextSection', () => {
  it('says what the context is by state: needed to start, then what the task reads', () => {
    renderSection(fakeTaskAuthoringApi());
    expect(screen.getByText(/^Inputs this task needs before it starts/)).toBeTruthy();
    cleanup();

    renderSection(fakeTaskAuthoringApi(), resourceFixture(), defaultAuthoring, true);
    expect(
      screen.getByText('Inputs this task reads, in order. task.md always comes first.'),
    ).toBeTruthy();
    expect(screen.queryByText(/before it starts/)).toBeNull();
  });

  it('writes the default context out with the added entry appended, at the read revision', async () => {
    const editTask = vi.fn(() => Promise.resolve({ taskId: TASK, revision: 'rev-2' }));
    renderSection(fakeTaskAuthoringApi({ editTask }));

    // The default: task.md, the Task's documents and the Specification overview; the overview is
    // already in context, so only UX can be picked.
    expect(screen.getByText('3 entries · default')).toBeTruthy();
    // What the first change does is said before it happens.
    expect(screen.getByText(/Your first change saves it as this task's own list/)).toBeTruthy();
    addSpecificationDocument('UX');

    await waitFor(() => expect(editTask).toHaveBeenCalled());
    expect(editTask).toHaveBeenCalledWith(SPEC, TASK, {
      expectedRevision: 'rev-1',
      context: [
        { kind: 'task-document', id: 'task', required: true },
        { kind: 'task-document', id: 'screens', required: true },
        { kind: 'specification-document', id: 'overview', required: true },
        { kind: 'specification-document', id: 'ux', required: true },
      ],
    });
  });

  it('names the entries the Engine refused as unresolved', async () => {
    const editTask = vi.fn(() =>
      Promise.reject(
        refusal('WORKFLOW_TASK_CONTEXT_UNRESOLVED', 422, {
          unresolved: [{ index: 3, key: 'specification-document:ux', reason: 'not-found' }],
        }),
      ),
    );
    renderSection(fakeTaskAuthoringApi({ editTask }));
    const dialog = addSpecificationDocument('UX');

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Some context entries do not resolve:');
    expect(alert.textContent).toContain('ux.md does not resolve.');
  });

  it("explains the refusal of the Task's own document as a required artifact", async () => {
    const editTask = vi.fn(() =>
      Promise.reject(
        refusal('WORKFLOW_INPUT_INVALID', 422, {
          invalidContext: [
            { index: 3, key: 'specification-document:ux', reason: 'required-own-artifact' },
          ],
        }),
      ),
    );
    renderSection(fakeTaskAuthoringApi({ editTask }));
    const dialog = addSpecificationDocument('UX');

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain("Not added: this is the task's own document");
    expect(alert.textContent).toContain('exit gate');
  });

  it('lists the entries that need attention first, then every entry in declared order', () => {
    const resource = resourceFixture({
      context: [
        { kind: 'task-document', id: 'task', required: true },
        { kind: 'specification-document', id: 'ux', required: true },
        { kind: 'specification-document', id: 'findings', required: true, artifact: true },
        { kind: 'specification-document', id: 'old-flow', required: true },
      ],
    });
    const [main, ux, findings, oldFlow] = resource.context!;
    renderSection(fakeTaskAuthoringApi(), resource, {
      context: {
        isDefault: false,
        entries: [
          resolved(main!),
          resolved(ux!),
          { entry: findings!, state: 'awaited' },
          { entry: oldFlow!, state: 'unresolved', reason: 'not-found' },
        ],
        defaultEntries: defaultAuthoring.context.defaultEntries,
      },
      dependencyCandidates: [],
    });

    const rows = () => screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(screen.getByText('4 entries · own list')).toBeTruthy();
    expect(rows()).toEqual([
      expect.stringMatching(/^findings.*Awaited · needed to start$/),
      expect.stringMatching(/^old-flow\.md.*Not found · required$/),
    ]);
    expect(screen.getByText('1 required entry is missing: old-flow.md.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show all 4 entries in order' }));
    expect(rows()).toEqual([
      expect.stringMatching(/^task\.md.*Always first$/),
      expect.stringMatching(/^ux\.md.*Required$/),
      expect.stringMatching(/^findings/),
      expect.stringMatching(/^old-flow\.md/),
    ]);
  });

  it('returns an own list to the default after a confirm that names the entries it removes', async () => {
    const editTask = vi.fn(() => Promise.resolve({ taskId: TASK, revision: 'rev-2' }));
    const own = [
      { kind: 'task-document', id: 'task', required: true },
      { kind: 'specification-document', id: 'overview', required: true },
      { kind: 'specification-document', id: 'ux', required: true },
      { kind: 'path', path: 'src/auth/**', required: false },
    ] as const;
    renderSection(fakeTaskAuthoringApi({ editTask }), resourceFixture({ context: [...own] }), {
      context: {
        isDefault: false,
        entries: own.map((entry) => resolved(entry)),
        defaultEntries: defaultAuthoring.context.defaultEntries,
      },
      dependencyCandidates: [],
    });
    expect(screen.getByText(/New task documents are not added to it automatically/)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use default context' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(
      "This task's list of 4 entries is replaced by the default",
    );
    expect(dialog.textContent).toContain('Entries you added are removed: ux.md, src/auth/**.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use default context' }));

    await waitFor(() =>
      expect(editTask).toHaveBeenCalledWith(SPEC, TASK, {
        expectedRevision: 'rev-1',
        context: null,
      }),
    );
  });

  it('offers no return to the default while the context is the default', () => {
    renderSection(fakeTaskAuthoringApi());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
    expect(screen.queryByRole('menuitem', { name: 'Use default context' })).toBeNull();
  });
});
