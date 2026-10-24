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
import { createAuthStore } from '../../../auth/store';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { createFixtureSpecsOverviewApi } from '../../../../test-support/specs/overview/api';
import { browserPage } from '../../../test-support/browserPage';

/*
 * The Documents workspace with archetype states, composed through the real router and query
 * client; only the document ports are in-memory fakes. Covers the tree grammar (type labels,
 * No type, File missing), the top region (Close-refusing issues, read-only line, Expected
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
type Scenario = 'states' | 'read-only' | 'conflict';

function treeFor(scenario: Scenario): DocumentTree {
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

/** Calls of the write ports, for the play functions. */
const calls = { addDocuments: fn(), operateDocument: fn() };

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
    ...(document.kind === 'text'
      ? { content: `# ${document.path}\n\nText of ${document.path}.\n` }
      : { content: undefined }),
  });
}

function Workspace({ scenario, path }: { scenario: Scenario; path: string }) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    let tree = treeFor(scenario);
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
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'demo' }) },
      documentApi: {
        getDocument: (_spec, id) =>
          tree.documents.some((document) => document.id === id)
            ? Promise.resolve(record(tree, id))
            : Promise.reject(
                new HttpClientError('Not found', {
                  kind: 'http',
                  status: 404,
                  data: { error: 'DOCUMENT_FILE_MISSING', code: 'DOCUMENT_FILE_MISSING' },
                }),
              ),
      },
      documentsApi: {
        ...defaults.documentsApi,
        catalogue: () => Promise.resolve(catalogue),
        documentTree: () => Promise.resolve(tree),
        addDocuments: (_spec, input) => {
          calls.addDocuments(input);
          return Promise.reject(
            new HttpClientError('Conflict', {
              kind: 'http',
              status: 409,
              data: { error: 'SPEC_BUSY', code: 'SPEC_BUSY' },
            }),
          );
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
          return Promise.reject(new Error('Not part of this story'));
        },
        save: () =>
          scenario === 'conflict'
            ? Promise.reject(
                new HttpClientError('Conflict', {
                  kind: 'http',
                  status: 409,
                  data: {
                    error: 'DOCUMENT_REVISION_CONFLICT',
                    code: 'DOCUMENT_REVISION_CONFLICT',
                  },
                }),
              )
            : Promise.resolve(saveResultFixture('2')),
      },
    });
    const router = createSpecFlowRouter(createMemoryHistory({ initialEntries: [path] }), services);
    return { query, router };
  }, [scenario, path]);
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
    // Rows: the type only where the name does not say it; the state labels always.
    await expect(screen.getByRole('button', { name: /^login-flow\.md\s*UX$/ })).toBeTruthy();
    await expect(screen.getByRole('button', { name: /^ux\.md$/ })).toBeTruthy();
    await expect(screen.getByRole('button', { name: /^backend\.md\s*File missing$/ })).toBeTruthy();
    await expect(
      screen.getByRole('button', {
        name: /meeting-2026-10-20-with-the-identity-team\.md\s*No type/,
      }),
    ).toBeTruthy();
    await expect(screen.getByText('1 entry in the folder could not be read.')).toBeTruthy();
    await expect(screen.getByText('Only the first entries are listed.')).toBeTruthy();
    await expect(screen.queryByText(/complete/i)).toBeNull();
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
    await expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(
      true,
    );
    await expect(editor.textContent).toContain('My change.');
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
    await expect(
      await screen.findByRole('alertdialog', { name: 'Remove the registration of backend.md?' }),
    ).toBeTruthy();
  },
};
