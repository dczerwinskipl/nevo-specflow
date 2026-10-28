import type {
  ArchetypeCatalogue,
  DocumentContent,
  DocumentOperationResult,
  DocumentTree,
} from '@nevo/specflow-contracts/documents';
import { HttpClientError } from '@nevo/http-client';
import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import {
  documentContentFixture,
  documentTreeFixture,
  saveResultFixture,
} from '../../../../test-support/documents/fixtures';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowRouter } from '../../../app/router';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import type { DocumentsApi } from '../api';
import { createAuthStore } from '../../../auth/store';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { createFixtureSpecsOverviewApi } from '../../../../test-support/specs/overview/api';
import { browserPage } from '../../../test-support/browserPage';
import { expectToast } from '../../../test-support/toast.stories-support';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';

/*
 * The Documents workspace with archetype states, composed through the real router and query
 * client; only the document ports are in-memory fakes. Covers the tree grammar (type labels,
 * unlabelled unclassified files, File missing), the top region (Close-refusing issues, read-only line, Expected
 * documents), New document, Assign type with the id the tab follows, and the tab states
 * (read-only line, save conflict, image, binary, missing file).
 */

const SPEC = 'sso';
const type = (id: string, title: string, defaultFilename?: string) => ({
  id,
  title,
  description: `${title}.`,
  useWhen: `Use ${title} when the work needs it.`,
  instructions: `How to write ${title}.`,
  ...(defaultFilename ? { defaultFilename } : {}),
});
const catalogue: ArchetypeCatalogue = {
  revision: 'catalogue-1',
  documentTypes: [
    type('overview', 'Overview', 'overview.md'),
    type('ux', 'UX', 'ux.md'),
    type('decisions', 'Decisions', 'decisions.md'),
    type('backend', 'Backend', 'backend.md'),
    type('note', 'Note'),
  ],
  archetypes: [
    {
      id: 'team',
      version: 1,
      title: 'Team feature',
      description: 'd',
      useWhen: 'u',
      requirements: [
        { documentType: 'overview', minCount: 1 },
        { documentType: 'decisions', minCount: 1 },
      ],
      documents: [
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          include: 'always',
          content: '',
        },
        {
          id: 'decisions',
          type: 'decisions',
          title: 'Decisions',
          filename: 'decisions.md',
          include: 'optional',
          content: '',
        },
      ],
    },
  ],
};

const available = { available: true };
const protectedAction = { available: false, reason: 'protected' } as const;
/** `project`: a project Runtime that does not serve the document writes yet (`not-implemented`). */
type Scenario = 'states' | 'read-only' | 'conflict' | 'project';
const notImplemented = { available: false, reason: 'not-implemented' } as const;

/** The tree a project Runtime without the write routes reports: every write unavailable. */
function withoutWrites(tree: DocumentTree): DocumentTree {
  return {
    ...tree,
    documents: tree.documents.map((document) =>
      document.protected
        ? document
        : {
            ...document,
            actions: {
              rename: notImplemented,
              move: notImplemented,
              delete: notImplemented,
              classify:
                document.classification === 'unclassified' ? notImplemented : { available: false },
            },
          },
    ),
    dangling: tree.dangling.map((entry) => ({ ...entry, actions: { delete: notImplemented } })),
    folders: tree.folders.map((folder) =>
      folder.path === ''
        ? folder
        : {
            ...folder,
            actions: { rename: notImplemented, move: notImplemented, delete: notImplemented },
          },
    ),
    capabilities: {
      createFile: notImplemented,
      createFolder: notImplemented,
      import: notImplemented,
      classify: notImplemented,
      formats: ['md', 'txt'],
    },
  };
}

function treeFor(scenario: Scenario): DocumentTree {
  if (scenario === 'project') return withoutWrites(treeFor('states'));
  const readOnly = { available: false, reason: 'branch-protected' } as const;
  return documentTreeFixture({
    archetype: { id: 'team', version: 1, title: 'Team feature' },
    folders: ['architecture', 'notes'],
    documents: [
      {
        id: 'overview',
        path: 'overview.md',
        type: 'overview',
        protected: true,
        actions: {
          rename: protectedAction,
          move: protectedAction,
          delete: protectedAction,
          classify: { available: false },
        },
      },
      { id: 'ux', path: 'ux.md', type: 'ux' },
      // Text above the read limit: the record carries no content.
      {
        id: 'huge',
        path: 'huge-log.md',
        type: undefined,
        classification: 'unclassified',
        size: 9_000_000,
      },
      { id: 'ux-2', path: 'architecture/login-flow.md', type: 'ux' },
      {
        id: 'u-notes-meeting',
        path: 'notes/meeting-2026-10-20-with-the-identity-team.md',
        classification: 'unclassified',
        type: undefined,
        actions: { rename: available, move: available, delete: available, classify: available },
      },
      {
        id: 'u-notes-sequence',
        path: 'notes/sequence.png',
        classification: 'unclassified',
        type: undefined,
        kind: 'image',
        mediaType: 'image/png',
        editable: false,
      },
      {
        id: 'u-notes-token',
        path: 'notes/token-sample.bin',
        classification: 'unclassified',
        type: undefined,
        kind: 'binary',
        mediaType: 'application/octet-stream',
        size: 14_200,
        editable: false,
      },
    ],
    dangling: [
      { id: 'backend', path: 'backend.md', type: 'backend', actions: { delete: available } },
    ],
    completeness: {
      complete: false,
      requirements: [
        { documentType: 'overview', minCount: 1, count: 1, satisfied: true },
        { documentType: 'decisions', minCount: 1, count: 0, satisfied: false },
      ],
    },
    issues:
      scenario === 'states'
        ? [
            { code: 'path-case-collision', path: 'notes/Meeting.md' },
            { code: 'skipped-entry' },
            { code: 'dangling', path: 'backend.md' },
          ]
        : [],
    skippedEntries: scenario === 'states' ? 1 : 0,
    truncated: scenario === 'states',
    ...(scenario === 'read-only'
      ? {
          capabilities: {
            createFile: readOnly,
            createFolder: readOnly,
            import: readOnly,
            classify: readOnly,
            formats: ['md', 'txt'],
          },
        }
      : {}),
  });
}

const unreachable = (): Promise<never> =>
  Promise.reject(new Error('The demo adapter must not be used in a project Runtime'));

/** Which service field serves the scenario's documents port (by Runtime mode). */
function documentsPorts(scenario: Scenario, api: DocumentsApi) {
  return scenario === 'project'
    ? {
        projectDocumentsApi: { ...api, emulated: false },
        demoDocumentsApi: {
          emulated: true,
          documentTree: unreachable,
          catalogue: unreachable,
          operateDocument: unreachable,
          addDocuments: unreachable,
          addFolder: unreachable,
          save: unreachable,
        },
      }
    : { demoDocumentsApi: api };
}

/** Calls of the write ports, for the play functions. */
const calls = { addDocuments: fn(), operateDocument: fn(), save: fn() };
/** Lets a story make a file disappear from the folder behind an open tab (it becomes dangling). */
const control = { removeFile: (_id: string) => undefined as void };

function record(tree: DocumentTree, id: string): DocumentContent {
  const document = tree.documents.find((candidate) => candidate.id === id)!;
  return documentContentFixture({
    id,
    path: document.path,
    title: document.path,
    classification: document.classification,
    ...(document.type ? { type: document.type } : { type: undefined }),
    kind: document.kind,
    mediaType: document.mediaType,
    size: document.size,
    editable: document.editable,
    ...(document.kind === 'text' && id !== 'huge'
      ? {
          content:
            // ux.md has sections, so its preview has a contents column beside the text.
            id === 'ux'
              ? `# ${document.path}\n\nText of ${document.path}.\n\n## Goal\n\nWhat the screen is for.\n\n## Flow\n\nThe steps.\n`
              : `# ${document.path}\n\nText of ${document.path}.\n`,
        }
      : { content: undefined }),
  });
}

function Workspace({
  scenario,
  path,
  saveRefusal,
}: {
  scenario: Scenario;
  path: string;
  /** The code every save is refused with (the conflict scenario uses the revision conflict). */
  saveRefusal?: string;
}) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    let tree = treeFor(scenario);
    // The first create is refused (another change runs); a second attempt goes through.
    let creates = 0;
    const defaults = createSpecFlowAppServices();
    const authStore = createAuthStore(defaults.authApi, {
      authenticationRequired: false,
      authenticated: false,
      user: { id: 'story', name: 'Demo' },
      loginMethods: { password: { enabled: false }, oidc: [] },
    });
    const workspace = createWorkspaceIntegrationApi();
    const services = createSpecFlowAppServices({
      authStore,
      specsOverviewApi: createFixtureSpecsOverviewApi(),
      specificationApi: {
        getSpecificationWorkspace: async () => {
          const dto = await workspace.getSpecificationWorkspace('api-integration');
          return { ...dto, specification: { ...dto.specification, title: 'Single sign-on' } };
        },
      },
      runtimeInfoApi: {
        getInfo: () => Promise.resolve({ dataMode: scenario === 'project' ? 'project' : 'demo' }),
      },
      documentApi: {
        getDocument: (_spec, id) =>
          // Text above the JSON read limit: the Runtime answers 413 DOCUMENT_TOO_LARGE.
          id === 'huge'
            ? Promise.reject(
                new HttpClientError('Too large', {
                  kind: 'http',
                  status: 413,
                  data: { error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' },
                }),
              )
            : tree.documents.some((document) => document.id === id)
              ? Promise.resolve(record(tree, id))
              : Promise.reject(
                  new HttpClientError('Not found', {
                    kind: 'http',
                    status: 404,
                    data: { error: 'DOCUMENT_FILE_MISSING', code: 'DOCUMENT_FILE_MISSING' },
                  }),
                ),
      },
      // A project Runtime is served by the project adapter only: the demo one must stay unused.
      ...documentsPorts(scenario, {
        ...defaults.demoDocumentsApi,
        catalogue: () => Promise.resolve(catalogue),
        documentTree: () => Promise.resolve(tree),
        addDocuments: (_spec, input) => {
          calls.addDocuments(input);
          if (creates++ === 0)
            return Promise.reject(
              new HttpClientError('Conflict', {
                kind: 'http',
                status: 409,
                data: { error: 'SPEC_BUSY', code: 'SPEC_BUSY' },
              }),
            );
          const added = documentTreeFixture({
            documents: input.documents.map((entry) => ({
              id: entry.path,
              path: entry.path,
              type: entry.type,
            })),
          }).documents;
          tree = { ...tree, documents: [...tree.documents, ...added] };
          const result: DocumentOperationResult = {
            operationId: input.operationId,
            revision: 't2',
            documents: added.map((document) => ({
              id: document.id,
              path: document.path,
              revision: document.revision,
              ...(document.type ? { type: document.type } : {}),
            })),
            removedDocumentIds: [],
            folders: [],
            committed: true,
          };
          return Promise.resolve(result);
        },
        operateDocument: (_spec, input) => {
          calls.operateDocument(input);
          if (input.action === 'classify' && input.documentId) {
            const id = input.type!;
            tree = {
              ...tree,
              documents: tree.documents.map((document) =>
                document.id === input.documentId
                  ? { ...document, id, type: input.type, classification: 'registered' }
                  : document,
              ),
            };
            const moved = tree.documents.find((document) => document.id === id)!;
            const result: DocumentOperationResult = {
              operationId: input.operationId,
              revision: 't2',
              documents: [{ id, path: moved.path, revision: moved.revision, type: input.type }],
              removedDocumentIds: [],
              folders: [],
              committed: true,
            };
            return Promise.resolve(result);
          }
          if (
            input.action === 'delete' &&
            tree.dangling.some((entry) => entry.id === input.documentId)
          ) {
            // Remove registration: the dangling entry leaves the registry.
            tree = {
              ...tree,
              dangling: tree.dangling.filter((entry) => entry.id !== input.documentId),
            };
            const result: DocumentOperationResult = {
              operationId: input.operationId,
              revision: 't2',
              documents: [],
              removedDocumentIds: [input.documentId!],
              folders: [],
              committed: true,
            };
            return Promise.resolve(result);
          }
          return Promise.reject(new Error('Not part of this story'));
        },
        save: () => {
          calls.save();
          const code =
            saveRefusal ?? (scenario === 'conflict' ? 'DOCUMENT_REVISION_CONFLICT' : undefined);
          return code
            ? Promise.reject(
                new HttpClientError('Refused', {
                  kind: 'http',
                  status: 409,
                  data: { error: code, code },
                }),
              )
            : Promise.resolve(saveResultFixture('2'));
        },
      }),
    });
    control.removeFile = (id) => {
      const document = tree.documents.find((item) => item.id === id);
      if (!document) return;
      tree = {
        ...tree,
        documents: tree.documents.filter((item) => item.id !== id),
        dangling: [
          ...tree.dangling,
          {
            id,
            path: document.path,
            type: document.type ?? 'note',
            actions: { delete: { available: true } },
          },
        ],
      };
      void query.invalidateQueries({ queryKey: ['specifications', SPEC] });
    };
    const router = createSpecFlowRouter(createMemoryHistory({ initialEntries: [path] }), services);
    return { query, router };
  }, [scenario, path, saveRefusal]);
  return (
    <QueryClientProvider client={setup.query}>
      <UiModulesProvider modules={builtInUiModuleRegistry}>
        <StoryLocalization locale="en">
          <RouterProvider router={setup.router} />
        </StoryLocalization>
      </UiModulesProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'SpecFlow/Screens/Documents/Archetype states',
  component: Workspace,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  args: { scenario: 'states', path: `/specs/${SPEC}/documents` },
} satisfies Meta<typeof Workspace>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);
async function wide() {
  await (await browserPage()).viewport(1440, 900);
}

/** The tree grammar and the top region: only what needs the reader, no completeness summary. */
export const TreeStates: Story = {
  play: async () => {
    await wide();
    const screen = body();
    await screen.findByText('Closing this specification will be refused');
    await expect(
      screen.getByText('Two files differ only in letter case: notes/Meeting.md'),
    ).toBeTruthy();
    const expected = screen.getByRole('region', { name: 'Expected documents' });
    await expect(within(expected).getByText('0 of 1')).toBeTruthy();
    await expect(
      within(expected).getByRole('button', { name: 'Add a Decisions document' }),
    ).toBeTruthy();
    // Rows: the type only where the name does not say it; File missing always; no label for an
    // unclassified file (owner feedback removed "No type").
    await expect(screen.getByRole('button', { name: /^login-flow\.md\s*UX$/ })).toBeTruthy();
    await expect(screen.getByRole('button', { name: /^ux\.md$/ })).toBeTruthy();
    await expect(screen.getByRole('button', { name: /^backend\.md\s*File missing$/ })).toBeTruthy();
    await expect(
      screen.getByRole('button', {
        name: /^meeting-2026-10-20-with-the-identity-team\.md$/,
      }),
    ).toBeTruthy();
    await expect(screen.getByText('1 entry in the folder could not be read.')).toBeTruthy();
    await expect(screen.getByText('Only the first entries are listed.')).toBeTruthy();
    await expect(screen.queryByText(/complete/i)).toBeNull();
  },
};

/**
 * A project Runtime that does not serve the document writes yet: one sentence above the tree, no
 * write offered anywhere (root actions, row menus, Expected documents, the idle area), and nothing
 * sent. The tree and the catalogue come from the project adapter.
 */
export const ProjectRuntimeWithoutWrites: Story = {
  args: { scenario: 'project' },
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    await screen.findByText('Editing documents is not available in this version yet.');
    await expect(screen.queryByRole('button', { name: 'Add a Decisions document' })).toBeNull();
    // The idle area offers no start action and does not suggest creating one; no demo notice.
    await expect(screen.getByText('Choose a document from the tree.')).toBeTruthy();
    await expect(screen.queryByRole('button', { name: 'New document…' })).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]!);
    await expect(screen.queryByRole('menuitem', { name: /demo/i })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // An unclassified file: Assign type is there but disabled, with the one sentence as the reason.
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Actions: meeting-2026-10-20-with-the-identity-team.md',
      }),
    );
    const menu = await screen.findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Assign type…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    for (const name of ['Rename', 'Move', 'Delete'])
      await expect(within(menu).getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    await expect(menu).toHaveTextContent('Editing documents is not available in this version yet.');
    await userEvent.keyboard('{Escape}');
    await expect(calls.addDocuments).not.toHaveBeenCalled();
    await expect(calls.operateDocument).not.toHaveBeenCalled();
  },
};

/** The same Runtime: a document opens read-only with the sentence as its first line, no Edit. */
export const ProjectRuntimeReadOnlyDocument: Story = {
  args: { scenario: 'project', path: `/specs/${SPEC}/documents/ux` },
  play: async () => {
    await wide();
    const screen = body();
    // Above the tree and as the document's first line: the same sentence.
    await waitFor(() =>
      expect(
        screen.getAllByText('Editing documents is not available in this version yet.'),
      ).toHaveLength(2),
    );
    await expect(screen.queryByRole('button', { name: 'Edit document' })).toBeNull();
    await expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    // The writing guidance is a read, so it is offered in a project Runtime too.
    await expect(screen.getByRole('button', { name: 'Guidance' })).toBeTruthy();
    await expect(calls.save).not.toHaveBeenCalled();
  },
};

/** A read-only Specification: the reason once above the tree, Expected documents without Add. */
export const ReadOnlyTree: Story = {
  args: { scenario: 'read-only' },
  play: async () => {
    await wide();
    const screen = body();
    await screen.findByText(
      'Editing is unavailable: this branch is protected from SpecFlow commits.',
    );
    await expect(screen.getByText('Decisions')).toBeTruthy();
    await expect(screen.queryByRole('button', { name: 'Add a Decisions document' })).toBeNull();
  },
};

/** New document from Expected documents: the type preselected, the name pre-filled; a refusal keeps the dialog. */
export const NewDocument: Story = {
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    await userEvent.click(await screen.findByRole('button', { name: 'Add a Decisions document' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'New document' }));
    await expect(
      dialog.getByRole('radio', { name: /Decisions/ }).getAttribute('aria-checked'),
    ).toBe('true');
    await expect(dialog.getByText('Suggested by Team feature')).toBeTruthy();
    const name = dialog.getByRole<HTMLInputElement>('textbox', { name: 'File name' });
    await expect(name.value).toBe('decisions.md');
    await userEvent.click(dialog.getByRole('radio', { name: /Note/ }));
    await expect(name.value).toBe('note.md');
    await userEvent.clear(name);
    await userEvent.type(name, 'ux.md');
    await expect(
      dialog.getByText('This path already exists. Choose a different name or folder.'),
    ).toBeTruthy();
    await userEvent.clear(name);
    await userEvent.type(name, 'meeting-notes');
    await userEvent.click(dialog.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(calls.addDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          documents: [{ path: 'meeting-notes.md', type: 'note', content: '' }],
        }),
      ),
    );
    // The refusal is shown in the dialog; the type and the name are kept.
    await expect(
      await dialog.findByText(/Another change to this specification is in progress/),
    ).toBeTruthy();
    await expect(name.value).toBe('meeting-notes');
    // Trying again succeeds: the dialog closes and a toast confirms what was added.
    await userEvent.click(dialog.getByRole('button', { name: 'Create' }));
    await expectToast('meeting-notes.md added (Note)');
    await expect(screen.queryByRole('dialog', { name: 'New document' })).toBeNull();
  },
};

/** Assign type from the row menu: the open tab, its draft and the route follow the new id. */
export const AssignTypeFollowsTheId: Story = {
  args: { path: `/specs/${SPEC}/documents/u-notes-meeting` },
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    await screen.findByRole('tab', { name: /meeting-2026-10-20/ });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Actions: meeting-2026-10-20-with-the-identity-team.md',
      }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Assign type…' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Assign a type' }));
    await userEvent.click(dialog.getByRole('radio', { name: /Decisions/ }));
    await userEvent.click(dialog.getByRole('button', { name: 'Assign type' }));
    await waitFor(() =>
      expect(calls.operateDocument).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'classify', type: 'decisions' }),
      ),
    );
    // One tab, under its new id, still named after the file.
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((tab) => tab.id)).toEqual([
        expect.stringContaining('decisions'),
      ]),
    );
    await expect(screen.getByRole('tab', { name: /meeting-2026-10-20/ })).toBeTruthy();
    await expectToast('meeting-2026-10-20-with-the-identity-team.md is now Decisions');
  },
};

/** A read-only tab: one quiet line with the reason and the remedy, no Edit. */
export const ReadOnlyTab: Story = {
  args: { scenario: 'read-only', path: `/specs/${SPEC}/documents/ux` },
  play: async () => {
    await wide();
    const screen = body();
    await screen.findByText(
      'Read-only: this branch is protected from SpecFlow commits. To edit, open the specification in a workspace on an allowed branch.',
    );
    await expect(screen.queryByRole('button', { name: 'Edit document' })).toBeNull();
  },
};

/** A save refused because the file changed on disk: the draft stays, Save waits for a choice. */
export const SaveConflict: Story = {
  args: { scenario: 'conflict', path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit document' }));
    const editor = await screen.findByRole('textbox', { name: 'Content of ux.md' });
    await userEvent.click(editor);
    await userEvent.keyboard('{Control>}{End}{/Control} My change.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = within(await screen.findByRole('alert'));
    await expect(alert.getByText('Not saved: ux.md changed on disk')).toBeTruthy();
    await expect(alert.getByRole('button', { name: 'Copy my version' })).toBeTruthy();
    await expect(alert.getByRole('button', { name: 'Load the version on disk…' })).toBeTruthy();
    // Save waits for a choice but keeps the focus of whoever pressed it (aria-disabled).
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save.disabled).toBe(false);
    await expect(save).toHaveFocus();
    await expect(editor.textContent).toContain('My change.');
    // Load the version on disk asks first, then replaces the draft and ends the conflict.
    await userEvent.click(alert.getByRole('button', { name: 'Load the version on disk…' }));
    const confirm = within(
      await screen.findByRole('alertdialog', { name: 'Load the version on disk?' }),
    );
    await userEvent.click(confirm.getByRole('button', { name: 'Discard and load' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Content of ux.md' }).textContent).not.toContain(
        'My change.',
      ),
    );
    await expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  },
};

/** Copy my version: the user's text goes to the clipboard and the version on disk becomes the base. */
export const SaveConflictCopyMyVersion: Story = {
  args: { scenario: 'conflict', path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    const copied: string[] = [];
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => (copied.push(text), Promise.resolve()) },
    });
    try {
      await userEvent.click(await screen.findByRole('button', { name: 'Edit document' }));
      const editor = await screen.findByRole('textbox', { name: 'Content of ux.md' });
      await userEvent.click(editor);
      await userEvent.keyboard('{Control>}{End}{/Control} Mine.');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      const alert = within(await screen.findByRole('alert'));
      await userEvent.click(alert.getByRole('button', { name: 'Copy my version' }));
      await waitFor(() => expect(copied.at(-1)).toContain('Mine.'));
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
      await expect(
        screen.getByRole('textbox', { name: 'Content of ux.md' }).textContent,
      ).not.toContain('Mine.');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    }
  },
};

/** Resizes the window and waits until the workspace layout has settled. */
const viewport = (width: number, height = 900) => settleViewport(width, height);

/**
 * Guidance on a wide panel (1920 px window): a third column right of the contents column; the text
 * keeps at least 528 px. It stays a column in edit mode, where the source editor keeps 960 px.
 */
export const GuidanceThreeColumns: Story = {
  args: { path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await viewport(1920, 1000);
    const screen = body();
    const toggle = await screen.findByRole('button', { name: 'Guidance' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // The panel has room for three columns once the window has been resized.
    await waitFor(() =>
      expect(document.querySelector('[data-document-preview]')!.clientWidth).toBeGreaterThanOrEqual(
        1280,
      ),
    );
    await userEvent.click(toggle);
    const column = await screen.findByRole('complementary', { name: 'How to write: UX' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.queryByRole('dialog')).toBeNull();
    await expect(within(column).getByText('How to write UX.')).toBeVisible();
    const contents = screen.getByRole('complementary', {
      name: 'Document contents and properties',
    });
    const group = column.parentElement!;
    const textColumn = group.firstElementChild!.getBoundingClientRect();
    await expect(contents.getBoundingClientRect().right).toBeLessThanOrEqual(
      column.getBoundingClientRect().left,
    );
    await expect(textColumn.width).toBeGreaterThanOrEqual(528);
    // Edit mode keeps the column at the editor's right edge; the editor keeps 960 px.
    await userEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    const editor = await screen.findByRole('textbox', { name: 'Content of ux.md' });
    const edited = await screen.findByRole('complementary', { name: 'How to write: UX' });
    await expect(editor.getBoundingClientRect().right).toBeLessThanOrEqual(
      edited.getBoundingClientRect().left + 1,
    );
    await expect(
      edited.getBoundingClientRect().left - editor.getBoundingClientRect().left,
    ).toBeGreaterThanOrEqual(900);
    await viewport(1440);
  },
};

/**
 * Guidance on a medium panel (1440 px window, 877 px pane): one right-hand slot for the contents or
 * the guidance. Guidance takes the slot and hides the contents; Contents take it back. The text
 * keeps at least 528 px.
 */
export const GuidanceSharedSlotMedium: Story = {
  args: { path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await viewport(1440);
    const screen = body();
    const guidance = await screen.findByRole('button', { name: 'Guidance' });
    const contents = await screen.findByRole('button', { name: 'Contents' });
    await expect(contents).toHaveAttribute('aria-pressed', 'true');
    await expect(
      screen.getByRole('complementary', { name: 'Document contents and properties' }),
    ).toBeVisible();
    await userEvent.click(guidance);
    const column = await screen.findByRole('complementary', { name: 'How to write: UX' });
    await expect(screen.queryByRole('dialog')).toBeNull();
    await expect(guidance).toHaveAttribute('aria-pressed', 'true');
    await expect(contents).toHaveAttribute('aria-pressed', 'false');
    await expect(
      screen.queryByRole('complementary', { name: 'Document contents and properties' }),
    ).toBeNull();
    await expect(
      column.parentElement!.firstElementChild!.getBoundingClientRect().width,
    ).toBeGreaterThanOrEqual(528);
    await userEvent.click(contents);
    await expect(
      await screen.findByRole('complementary', { name: 'Document contents and properties' }),
    ).toBeVisible();
    await expect(screen.queryByRole('complementary', { name: 'How to write: UX' })).toBeNull();
    await expect(guidance).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Below the contents threshold (1100 px window, pane under 840 px) the guidance is a sheet. */
export const GuidanceSheetBelowTheColumnThreshold: Story = {
  args: { path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await viewport(1100);
    const screen = body();
    await waitFor(() =>
      expect(document.querySelector('[data-document-preview]')!.clientWidth).toBeLessThan(840),
    );
    const toggle = await screen.findByRole('button', { name: 'Guidance' });
    await userEvent.click(toggle);
    const sheet = within(await screen.findByRole('dialog', { name: 'Guidance' }));
    await expect(sheet.getByText('How to write: UX')).toBeVisible();
    await expect(sheet.getByText('How to write UX.')).toBeVisible();
    await expect(screen.queryByRole('complementary', { name: 'How to write: UX' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(toggle).toHaveFocus());
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await viewport(1440);
  },
};

/** Guidance on a phone: the same sheet, inside the viewport. */
export const GuidanceSheetNarrow: Story = {
  args: { path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await viewport(390, 844);
    const screen = body();
    await userEvent.click(await screen.findByRole('button', { name: 'Guidance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Guidance' });
    await expect(dialog.getBoundingClientRect().right).toBeLessThanOrEqual(390);
    await expect(within(dialog).getByText('How to write UX.')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close guidance' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await viewport(1440);
  },
};

/**
 * A very wide panel (2560 px window) centres the text and its contents column: the spare width
 * becomes two equal gutters, never one band on the right; the text keeps its measure.
 */
export const PreviewCentredOnWideScreens: Story = {
  args: { path: `/specs/${SPEC}/documents/ux` },
  play: async () => {
    await viewport(2560, 1200);
    const screen = body();
    const contents = await screen.findByRole('complementary', {
      name: 'Document contents and properties',
    });
    const group = contents.parentElement!;
    // Measured once the window has been resized and the panel has laid out again.
    await waitFor(() => {
      const box = group.getBoundingClientRect();
      const panel = document.querySelector('[data-document-preview]')!.getBoundingClientRect();
      const left = box.left - panel.left;
      const right = panel.right - box.right;
      if (left <= 24 || Math.abs(left - right) > 2)
        throw new Error(`Gutters are not equal: ${left} px left, ${right} px right`);
    });
    await expect(group.firstElementChild!.getBoundingClientRect().width).toBeLessThanOrEqual(760);
    await viewport(1440);
  },
};

/** A document without a contents column (one heading) is centred the same way on its measure. */
export const PreviewWithoutContentsCentredOnWideScreens: Story = {
  args: { path: `/specs/${SPEC}/documents/ux-2` },
  play: async () => {
    await viewport(2560, 1200);
    const screen = body();
    const heading = await screen.findByRole('heading', { name: 'architecture/login-flow.md' });
    await expect(
      screen.queryByRole('complementary', { name: 'Document contents and properties' }),
    ).toBeNull();
    const measure = heading.closest('[data-document-preview] > * > div')!;
    await waitFor(() => {
      const box = measure.getBoundingClientRect();
      const panel = document.querySelector('[data-document-preview]')!.getBoundingClientRect();
      const left = box.left - panel.left;
      const right = panel.right - box.right;
      if (left <= 24 || Math.abs(left - right) > 2)
        throw new Error(`Gutters are not equal: ${left} px left, ${right} px right`);
    });
    await expect(measure.getBoundingClientRect().width).toBeLessThanOrEqual(760);
    await viewport(1440);
  },
};

/** An image tab: the bytes from the raw route as an image; Download is its only, promoted, action. */
export const ImageTab: Story = {
  args: { path: `/specs/${SPEC}/documents/u-notes-sequence` },
  play: async () => {
    await wide();
    const screen = body();
    const image = await screen.findByRole<HTMLImageElement>('img', { name: 'sequence.png' });
    await expect(image.getAttribute('src')).toBe(
      `/api/specs/${SPEC}/documents/u-notes-sequence/raw`,
    );
    await expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    await expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  },
};

/** A file that cannot be shown: its facts and one Download in the body (the header keeps it in the menu). */
export const BinaryTab: Story = {
  args: { path: `/specs/${SPEC}/documents/u-notes-token` },
  play: async () => {
    await wide();
    const screen = body();
    await screen.findByText(
      'This file cannot be shown here. Download it to open it in another program.',
    );
    const facts = within(screen.getByLabelText('File information'));
    await expect(facts.getByText('notes/token-sample.bin')).toBeTruthy();
    await expect(facts.getByText('application/octet-stream')).toBeTruthy();
    await expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(1);
  },
};

/** A registry entry whose file is missing: the missing tab explains it and offers Remove registration. */
export const DanglingTab: Story = {
  args: { path: `/specs/${SPEC}/documents/backend` },
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    await screen.findByText('backend.md is missing');
    await expect(
      screen.getByText(
        'The specification lists backend.md as a Backend document, but the file is not in the folder. It may have been moved or deleted outside SpecFlow.',
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove registration' }));
    const confirm = within(
      await screen.findByRole('alertdialog', { name: 'Remove the registration of backend.md?' }),
    );
    await userEvent.click(confirm.getByRole('button', { name: 'Remove registration' }));
    await expectToast('Registration of backend.md removed');
  },
};

/** Edits ux.md and presses Save; the save is refused with the story's code. */
async function refusedSave(userEvent: {
  click: (element: Element) => Promise<void>;
  keyboard: (text: string) => Promise<void>;
}) {
  await wide();
  const screen = body();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit document' }));
  await userEvent.click(await screen.findByRole('textbox', { name: 'Content of ux.md' }));
  await userEvent.keyboard('{Control>}{End}{/Control} Change.');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  return within(await screen.findByRole('alert'));
}

const refused = (saveRefusal: string) => ({
  scenario: 'states' as const,
  path: `/specs/${SPEC}/documents/ux`,
  saveRefusal,
});

/** The protected branch refuses the save: the reason and the remedy, the draft kept. */
export const SaveRefusedBranchProtected: Story = {
  args: refused('BRANCH_PROTECTED'),
  play: async ({ userEvent }) => {
    const alert = await refusedSave(userEvent);
    await expect(
      alert.getByText('Not saved: this branch is protected from SpecFlow commits.'),
    ).toBeTruthy();
    await expect(
      alert.getByText('To edit, open the specification in a workspace on an allowed branch.'),
    ).toBeTruthy();
  },
};

/** Git cannot take a commit now: what to do, and Try again. */
export const SaveRefusedCommitBlocked: Story = {
  args: refused('COMMIT_BLOCKED'),
  play: async ({ userEvent }) => {
    const alert = await refusedSave(userEvent);
    await expect(alert.getByText('Not saved: Git cannot take a commit right now')).toBeTruthy();
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeTruthy();
  },
};

/** Another change is running: Try again. */
export const SaveRefusedBusy: Story = {
  args: refused('SPEC_BUSY'),
  play: async ({ userEvent }) => {
    const alert = await refusedSave(userEvent);
    await expect(alert.getByText('Not saved: another change is in progress')).toBeTruthy();
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeTruthy();
  },
};

/** Written but not committed: Resume, and editing is locked until then. */
export const SaveRecoveryRequired: Story = {
  args: refused('DOCUMENT_RECOVERY_REQUIRED'),
  play: async ({ userEvent }) => {
    const alert = await refusedSave(userEvent);
    await expect(alert.getByText('Saved to disk, but not committed')).toBeTruthy();
    await expect(alert.getByRole('button', { name: 'Resume' })).toBeTruthy();
    // Editing is locked until the save is resumed: typing changes nothing.
    const editor = body().getByRole('textbox', { name: 'Content of ux.md' });
    await userEvent.click(editor);
    await userEvent.keyboard('Locked');
    await expect(editor.textContent).not.toContain('Locked');
  },
};

/** The file disappeared: the save says so and the draft is kept. */
export const SaveRefusedFileMissing: Story = {
  args: refused('DOCUMENT_FILE_MISSING'),
  play: async ({ userEvent }) => {
    const alert = await refusedSave(userEvent);
    await expect(alert.getByText('Not saved: the file is missing')).toBeTruthy();
    await expect(body().getByRole('textbox', { name: 'Content of ux.md' }).textContent).toContain(
      'Change.',
    );
  },
};

/** Text above the read limit (the read answers 413) opens as a file with its facts and Download. */
export const TooLargeText: Story = {
  args: { path: `/specs/${SPEC}/documents/huge` },
  play: async () => {
    await wide();
    const screen = body();
    await screen.findByText('This file is too large to show here.');
    // The read would fail the same way again: no Retry.
    await expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(1);
  },
};

/**
 * A file with unsaved changes disappears from the folder: its missing tab offers Remove
 * registration, and the confirmation says the changes will be lost.
 */
export const DanglingTabWithUnsavedChanges: Story = {
  args: { path: `/specs/${SPEC}/documents/ux` },
  play: async ({ userEvent }) => {
    await wide();
    const screen = body();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit document' }));
    await userEvent.click(await screen.findByRole('textbox', { name: 'Content of ux.md' }));
    await userEvent.keyboard('{Control>}{End}{/Control} Unsaved.');
    control.removeFile('ux');
    await screen.findByText('ux.md is missing');
    await userEvent.click(screen.getByRole('button', { name: 'Remove registration' }));
    const confirm = within(
      await screen.findByRole('alertdialog', { name: 'Remove the registration of ux.md?' }),
    );
    await expect(confirm.getByText('Your unsaved changes to ux.md will be lost.')).toBeTruthy();
    await expect(confirm.getByRole('button', { name: 'Remove and discard changes' })).toBeTruthy();
  },
};
