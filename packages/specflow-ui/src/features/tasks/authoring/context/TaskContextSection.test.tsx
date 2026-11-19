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
  editable = true,
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
      editable={editable}
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

/** The own list of the fixture Task: the default plus an entry, so "Use default context" applies. */
const ownAuthoring: TaskAuthoring = {
  context: {
    isDefault: false,
    entries: [
      ...defaultAuthoring.context.entries,
      resolved({ kind: 'specification-document', id: 'ux', required: true }),
    ],
    defaultEntries: defaultAuthoring.context.defaultEntries,
  },
  dependencyCandidates: [],
};
const ownResource = () =>
  resourceFixture({ context: ownAuthoring.context.entries.map(({ entry }) => entry) });

/** Opens the source label's explanation and returns its text. */
function explanation(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));

  return screen.getByRole('dialog').textContent;
}

function openRowMenu(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' });

  return screen.getByRole('menu');
}

describe('TaskContextSection', () => {
  it('shows only the source label at rest; the explanation opens on demand', () => {
    renderSection(fakeTaskAuthoringApi());
    expect(screen.getByText('Default context')).toBeTruthy();
    // The open header carries the count only: the label says which list it is.
    expect(screen.getByText('3 entries')).toBeTruthy();
    expect(screen.queryByText(/Inputs this task/)).toBeNull();
    expect(screen.queryByText(/Your first change/)).toBeNull();

    const text = explanation('About the default context');
    expect(text).toContain('Inputs this task needs before it starts');
    expect(text).toContain('New task documents join it by themselves.');
    expect(text).toContain("Your first change saves it as this task's own list.");
  });

  it('explains a read-only default without the first change', () => {
    renderSection(fakeTaskAuthoringApi(), resourceFixture(), defaultAuthoring, false, false);
    const text = explanation('About the default context');
    expect(text).toContain('It follows this task');
    expect(text).not.toContain('Your first change');
  });

  it('explains an own list and how the default comes back', () => {
    renderSection(fakeTaskAuthoringApi(), ownResource(), ownAuthoring);
    expect(screen.getByText('Own context list')).toBeTruthy();
    const text = explanation('About this context list');
    expect(text).toContain('New task documents are not added to it by themselves.');
    expect(text).toContain('Choose “Use default context” in the + menu');
    expect(text).not.toContain('Your first change');
  });

  it('says what a started task reads', () => {
    renderSection(fakeTaskAuthoringApi(), resourceFixture(), defaultAuthoring, true);
    const text = explanation('About the default context');
    expect(text).toContain('Inputs this task reads, in order. task.md always comes first.');
    expect(text).not.toContain('before it starts');
  });

  it('says in the row menu what a change of the default does, and only then', () => {
    renderSection(fakeTaskAuthoringApi());
    const menu = openRowMenu('overview.md');
    const note = within(menu).getByText(/^A change here saves the context/);
    expect(menu.getAttribute('aria-describedby')).toBe(note.id);
    // The consequence comes first, before any choice, set apart by a separator.
    const follows = (node: Node) =>
      Boolean(note.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    const [separator] = within(menu).getAllByRole('separator');
    expect(separator && follows(separator)).toBe(true);
    expect(separator?.compareDocumentPosition(within(menu).getByText('Required'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // The last entry cannot move down, the first movable one not up: still one separator each.
    expect(within(menu).getAllByRole('separator')).toHaveLength(3);
    cleanup();

    renderSection(fakeTaskAuthoringApi(), ownResource(), ownAuthoring);
    const own = openRowMenu('overview.md');
    expect(within(own).queryByText(/A change here/)).toBeNull();
    expect(own.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows no move items, and no doubled separator, on a row that cannot move', () => {
    const two = [
      { kind: 'task-document', id: 'task', required: true },
      { kind: 'specification-document', id: 'overview', required: true },
    ] as const;
    renderSection(fakeTaskAuthoringApi(), resourceFixture({ context: [...two] }), {
      context: {
        isDefault: false,
        entries: two.map((entry) => resolved(entry)),
        defaultEntries: defaultAuthoring.context.defaultEntries,
      },
      dependencyCandidates: [],
    });
    const menu = openRowMenu('overview.md');
    expect(within(menu).queryByRole('menuitem', { name: /Move/ })).toBeNull();
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
  });

  it('says in the Add dialog what adding to the default does, and only then', () => {
    renderSection(fakeTaskAuthoringApi());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Code path' }));
    expect(screen.getByRole('dialog').textContent).toContain(
      "Adding this saves the context as this task's own list.",
    );
    cleanup();

    renderSection(fakeTaskAuthoringApi(), ownResource(), ownAuthoring);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Code path' }));
    expect(screen.getByRole('dialog').textContent).not.toContain('Adding this saves');
  });

  it('writes the default context out with the added entry appended, at the read revision', async () => {
    const editTask = vi.fn(() => Promise.resolve({ taskId: TASK, revision: 'rev-2' }));
    renderSection(fakeTaskAuthoringApi({ editTask }));

    // The default: task.md, the Task's documents and the Specification overview; the overview is
    // already in context, so only UX can be picked.
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
    expect(screen.getByText('4 entries')).toBeTruthy();
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

    fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use default context' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(
      "This task's list of 4 entries will be replaced by the default",
    );
    expect(dialog.textContent).toContain('Entries you added will be removed: ux.md, src/auth/**.');
    expect(dialog.textContent).toContain('the context follows this task again');
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
