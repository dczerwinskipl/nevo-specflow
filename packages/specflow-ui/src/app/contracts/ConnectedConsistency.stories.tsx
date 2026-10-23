import { HttpClientError } from '@nevo/http-client';
import { createSpecsFixture } from '../../../test-support/specs/overview/fixtures';
import { specsOverviewKeys } from '../../features/specs/overview/data/queries';
import { EditorView } from '@codemirror/view';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { RouterProvider, createMemoryHistory, createBrowserHistory } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { browserPage } from '../../test-support/browserPage';
import type { DemoDocumentTree, DemoSessionDetail } from '@nevo/specflow-contracts/demo';
import { createAuthStore } from '../../auth/store';
import { createSpecFlowAppServices } from '../../services';
import { createSpecFlowRouter } from '../router';
import { createSpecFlowQueryClient } from '../queryClient';
import { UiModulesProvider } from '../ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../ui-modules/builtInUiModules';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { createWorkspaceIntegrationApi } from '../../../test-support/specs/workspace/api';
import { createFixtureSpecsOverviewApi } from '../../../test-support/specs/overview/api';
import { catalogue } from '../../features/specs/creation/options/creationCatalogue.stories-support';
import {
  createdSpecFixture,
  createOptionsFixture,
  type OptionsVariant,
} from '../../features/specs/creation/options/creationOptions.stories-support';
import { settleViewport } from '../../test-support/viewportSettle.stories-support';
import {
  invokeDocumentAction,
  waitForDocumentActions,
} from '../../features/documents/editor/documentHeaderActions.stories-support';

const createResponseControl = { fail: () => undefined as void };
export { createResponseControl };
const historyControl = { back: () => undefined as void };
/** Lets a story make a document disappear from the Runtime behind the open tabs back. */
const tabsControl = { removeExternally: (_id: string) => undefined as void };
function Connected({
  path = '/specs/api-integration/documents/spec?collection=archive',
  catalogueState = 'ready',
  optionsVariant = 'default',
  longDocument = false,
  longFilename = false,
  threeDocuments = false,
  historyFromOverview = false,
  browserWindow,
  createOutcome = 'success',
}: {
  path?: string;
  longDocument?: boolean;
  threeDocuments?: boolean;
  longFilename?: boolean;
  historyFromOverview?: boolean;
  browserWindow?: Window;
  createOutcome?: 'success' | 'failure' | 'unknown' | 'pending' | 'deferred-failure';
  catalogueState?: 'ready' | 'loading' | 'error';
  optionsVariant?: OptionsVariant;
}) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    });
    for (const collection of ['current', 'archive'] as const) {
      const data = createSpecsFixture(collection);
      if (data.collection === 'current')
        query.setQueryData(specsOverviewKeys.collection(collection), {
          ...data,
          items: data.items.map((item, index) =>
            index === 0 ? { ...item, id: 'api-integration', title: 'Logowanie SSO' } : item,
          ),
        });
      else
        query.setQueryData(specsOverviewKeys.collection(collection), {
          ...data,
          items: data.items.map((item, index) =>
            index === 0 ? { ...item, id: 'api-integration', title: 'Logowanie SSO' } : item,
          ),
        });
    }
    const defaults = createSpecFlowAppServices();
    const auth = createAuthStore(defaults.authApi, {
      authenticationRequired: false,
      authenticated: false,
      user: { id: 'story', name: 'Demo' },
      loginMethods: { password: { enabled: false }, oidc: [] },
    });
    const hidden = new Set<string>();
    const records: Record<
      string,
      { id: string; title: string; filename: string; revision: string; content: string }
    > = {
      spec: {
        id: 'spec',
        title: 'Specification',
        filename: longFilename
          ? 'notes/architecture-decisions-and-client-authentication-interview.md'
          : 'specification.md',
        revision: '1',
        content:
          '# Logowanie SSO\n\n## Problem\n\nPracownicy logują się przez firmowego dostawcę tożsamości.\n\n## Kryteria akceptacji\n\n- Powrót do otwartego projektu.\n- Możliwość bezpiecznego wylogowania.\n' +
          (longDocument
            ? '\n\nScenariusz: po przerwanym logowaniu użytkownik wraca do poprzedniego projektu.\n'.repeat(
                80,
              )
            : ''),
      },
      transcript: {
        id: 'transcript',
        title: 'Rozmowa z klientem',
        filename: 'notes/CLIENT.TXT',
        revision: '1',
        content:
          '# Rozmowa z klientem\n\nKlient: potrzebujemy logowania SSO.\nTo jest tekst, nie nagłówek Markdown.',
      },
      ...(threeDocuments
        ? {
            adr: {
              id: 'adr',
              title: 'ADR',
              filename: 'adr-001.md',
              revision: '1',
              content:
                '# ADR-001 · Deterministyczna admisja zadań i granice wykonania agentów\n\nWstęp.\n\n## Kontekst systemu i ograniczenia\n\nTekst.\n\n## Decyzja\n\nTekst.',
            },
            plan: {
              id: 'plan',
              title: 'Plan',
              filename: 'plan.md',
              revision: '1',
              content:
                '# Plan wdrożenia\n\nKroki wdrożenia logowania SSO.\n\n## Etap 1\n\nPrzygotowanie.\n\n## Etap 2\n\nWdrożenie.\n\n## Etap 3\n\nOdbiór.',
            },
          }
        : {}),
    };
    const yes = { available: true };
    const actions = { rename: yes, move: yes, delete: yes };
    const tree: DemoDocumentTree = {
      revision: '1',
      folders: [
        {
          path: '',
          actions: {
            rename: { available: false, reason: 'root_protected' },
            move: { available: false, reason: 'root_protected' },
            delete: { available: false, reason: 'root_protected' },
          },
        },
        { path: 'notes', actions },
        { path: '__root', actions },
      ],
      documents: Object.values(records).map((doc) => ({
        id: doc.id,
        path: doc.filename,
        revision: doc.revision,
        required: doc.id === 'spec',
        actions:
          doc.id === 'spec'
            ? {
                rename: { available: false, reason: 'demo_document_required' },
                move: { available: false, reason: 'demo_document_required' },
                delete: { available: false, reason: 'demo_document_required' },
              }
            : actions,
      })),
      capabilities: { createFile: yes, createFolder: yes, import: yes, formats: ['md', 'txt'] },
    };
    const session: DemoSessionDetail = {
      sessionId: 'session',
      title: 'Spec Writer',
      specId: 'api-integration',
      configuration: {
        profile: 'Spec Writer',
        providerId: 'codex',
        providerTitle: 'Codex',
        modelId: 'model-a',
        modelTitle: 'Codex model A',
        mode: 'agent',
      },
      location: catalogue.currentLocation,
      context: {
        archetype: 'Feature v2',
        project: 'Projekt demonstracyjny',
        specification: 'Logowanie SSO',
        documents: Object.values(records).map((doc) => doc.filename),
        instructions: ['Rola Spec Writera'],
      },
    };
    const source = createWorkspaceIntegrationApi();
    const overview = createFixtureSpecsOverviewApi();
    const services = createSpecFlowAppServices({
      authStore: auth,
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'demo' }) },
      specsOverviewApi: {
        getOverview: async (collection, signal) => {
          const data = await overview.getOverview(collection, signal);
          if (data.collection === 'current')
            return {
              ...data,
              items: data.items.map((item, index) =>
                index === 0 ? { ...item, id: 'api-integration', title: 'Logowanie SSO' } : item,
              ),
            };
          return {
            ...data,
            items: data.items.map((item, index) =>
              index === 0 ? { ...item, id: 'api-integration', title: 'Logowanie SSO' } : item,
            ),
          };
        },
      },
      specificationApi: {
        getSpecificationWorkspace: async () => {
          const dto = await source.getSpecificationWorkspace('api-integration');
          return {
            ...dto,
            specification: { ...dto.specification, title: 'Logowanie SSO' },
            sections: {
              ...dto.sections,
              documents: {
                state: 'available',
                data: {
                  items: Object.values(records).map((doc) => ({
                    id: doc.id,
                    title: doc.title,
                    filename: doc.filename,
                    kind: 'markdown',
                  })),
                },
              },
              sessions: {
                state: 'available',
                data: {
                  items: [{ id: 'session', title: 'Spec Writer', status: 'quiet', taskIds: [] }],
                  attention: [],
                },
              },
            },
          };
        },
      },
      documentApi: {
        getDocument: (_spec, id) =>
          hidden.has(id) || !records[id]
            ? Promise.reject(
                new HttpClientError('Not found', {
                  kind: 'http',
                  status: 404,
                  data: { error: 'demo_document_not_found' },
                }),
              )
            : Promise.resolve(records[id]),
      },
      documentsApi: {
        ...defaults.documentsApi,
        documentTree: () =>
          Promise.resolve({
            ...tree,
            documents: tree.documents.filter((document) => !hidden.has(document.id)),
          }),
        save: (_spec, id, input) => {
          const doc = records[id]!;
          Object.assign(doc, { content: input.content, revision: '2' });
          return Promise.resolve({ revision: '2' });
        },
      },
      sessionsApi: {
        ...defaults.sessionsApi,
        session: () => Promise.resolve(session),
        allocate: () =>
          Promise.resolve({ sessionId: 'session', location: catalogue.currentLocation }),
      },
      demoCreationApi: {
        ...defaults.demoCreationApi,
        catalogue: () =>
          catalogueState === 'loading'
            ? new Promise(() => undefined)
            : catalogueState === 'error'
              ? Promise.reject(new Error('Catalogue unavailable'))
              : Promise.resolve(catalogue),
        createOptions: () => Promise.resolve(createOptionsFixture(optionsVariant)),
        create: (input) =>
          createOutcome === 'failure'
            ? Promise.reject(
                new HttpClientError('Create failed', {
                  kind: 'http',
                  status: 409,
                  data: { error: 'demo_invalid_selection' },
                }),
              )
            : createOutcome === 'unknown'
              ? Promise.reject(new Error('Unknown create outcome'))
              : createOutcome === 'deferred-failure'
                ? new Promise((_resolve, reject) => {
                    createResponseControl.fail = () =>
                      reject(
                        new HttpClientError('Create failed', {
                          kind: 'http',
                          status: 409,
                          data: { error: 'demo_invalid_selection' },
                        }),
                      );
                  })
                : createOutcome === 'pending'
                  ? new Promise(() => undefined)
                  : Promise.resolve(
                      createdSpecFixture(input.operationId, {
                        specId: 'api-integration',
                        documentIds: ['spec'],
                      }),
                    ),
      },
    });
    let history;
    if (browserWindow) {
      browserWindow.history.replaceState(null, '', '/?collection=archive');
      history = createBrowserHistory({ window: browserWindow });
      history.push(path);
      history.flush();
    } else
      history = createMemoryHistory({
        initialEntries: historyFromOverview ? ['/?collection=archive', path] : [path],
      });
    const router = createSpecFlowRouter(history, services);
    tabsControl.removeExternally = (id) => {
      hidden.add(id);
      void query.invalidateQueries({ queryKey: ['specifications', 'api-integration'] });
    };
    return { query, router };
  }, [
    path,
    catalogueState,
    optionsVariant,
    longDocument,
    longFilename,
    threeDocuments,
    historyFromOverview,
    browserWindow,
    createOutcome,
  ]);
  useEffect(() => {
    if (historyFromOverview) historyControl.back = () => setup.router.history.back();
    return () => {
      if (historyFromOverview) historyControl.back = () => undefined;
    };
  }, [setup, historyFromOverview]);
  const href = useSyncExternalStore(
    (listener) => setup.router.subscribe('onResolved', listener),
    () => setup.router.state.location.href,
  );
  return (
    <QueryClientProvider client={setup.query}>
      <UiModulesProvider modules={builtInUiModuleRegistry}>
        <StoryLocalization locale="pl">
          <RouterProvider router={setup.router} />
          <output className="sr-only" aria-label="Bieżąca trasa">
            {href}
          </output>
        </StoryLocalization>
      </UiModulesProvider>
    </QueryClientProvider>
  );
}
const meta = {
  title: 'SpecFlow/Contracts/Connected creation consistency',
  component: Connected,
  excludeStories: ['ConnectedApplication', 'createResponseControl'],
  parameters: { layout: 'fullscreen' },
  tags: ['contract'],
} satisfies Meta<typeof Connected>;
export default meta;
type Story = StoryObj<typeof meta>;
async function viewport(width: number, height = 844) {
  await (await browserPage()).viewport(width, height);
  await waitFor(() => {
    const layout = document.querySelector('[data-layout]')?.getAttribute('data-layout');
    if (layout !== (width >= 840 ? 'split' : 'stacked'))
      throw new Error('Responsive layout has not settled');
    const surface = document.querySelector<HTMLElement>(
      '[data-workspace-active="true"][data-workspace-instance^="runtime-"]',
    );
    if (width < 840 && surface) {
      const bounds = surface.getBoundingClientRect();
      if (
        surface.dataset.workspaceMotion !== 'idle' ||
        Math.abs(bounds.left) > 1 ||
        Math.abs(bounds.right - width) > 1
      )
        throw new Error('Responsive surface has not settled');
    }
  });
}
export const ResponsiveDirtyDocument: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await viewport(1440, 900);
    // The document opens in Preview by default; switch to Edit to make it dirty.
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const input = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(input);
    await userEvent.keyboard('{Control>}{End}{/Control}');
    await userEvent.keyboard('{Enter}{Enter}Retained position');
    const selection = EditorView.findFromDOM(input.closest('.cm-editor')!)!.state.selection.main
      .anchor;
    await settleViewport();
    await viewport(390);
    const mobile = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await expect(mobile).toHaveTextContent('Retained position');
    await expect(
      EditorView.findFromDOM(mobile.closest('.cm-editor')!)!.state.selection.main.anchor,
    ).toBe(selection);
    await expect(canvas.getAllByRole('textbox', { name: 'Treść specification.md' })).toHaveLength(
      1,
    );
    await settleViewport(390, 844);
    await viewport(320);
    // One header carries identity and actions: no second document toolbar, no overflow.
    await expect(canvasElement.querySelector('[role="toolbar"]')).toBeNull();
    const header = canvasElement.querySelector<HTMLElement>(
      '[data-workspace-header]:has([data-workspace-header-title])',
    )!;
    await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
    await settleViewport(320, 740);
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    await expect(canvas.getByText(/Retained position/)).toBeVisible();
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do listy dokumentów' }));
    await expect(
      canvas.queryByRole('textbox', { name: 'Treść specification.md' }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /^specification.md/ }));
    // Reopening the same document retains its earlier Edit mode and draft.
    await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await viewport(1440, 900);
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toHaveTextContent(
      'Retained position',
    );
    await expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent('collection=archive');
    // A tab switch is not leaving: the dirty document stays in its tab and nothing asks.
    await userEvent.click(canvas.getByRole('button', { name: /^CLIENT.TXT$/ }));
    await expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    // Plain text has one view: it opens as the editable source.
    await canvas.findByRole('textbox', { name: 'Treść notes/CLIENT.TXT' });
    await expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent('collection=archive');
    await expect(
      canvas.getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected')),
    ).toEqual(['false', 'true']);
    // The first tab keeps its unsaved edits.
    await userEvent.click(canvas.getByRole('tab', { name: /specification.md/ }));
    await expect(
      await canvas.findByRole('textbox', { name: 'Treść specification.md' }),
    ).toHaveTextContent('Retained position');
  },
};
export const OpeningADocumentFromTheTreeMovesFocusToItsHeading: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    for (const width of [1440, 390]) {
      await viewport(width, 900);
      const back = canvas.queryByRole('button', { name: 'Wróć do listy dokumentów' });
      if (back) await userEvent.click(back);
      const row = await canvas.findByRole('button', { name: /^specification.md/ });
      row.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => {
        const active = document.activeElement;
        // Wide and narrow: the document heading (focus on a tab would open its tooltip).
        const target = active?.matches('[data-workspace-header-title="true"]');
        if (!target) throw new Error(`Focus is on ${active?.tagName} at ${width}px`);
        void expect(active).toHaveTextContent('specification.md');
      });
    }
  },
};
/**
 * `documents` and `documents/$documentId` share one layout instance: opening documents must not
 * rebuild the explorer, so a folder the user collapsed (or opened) keeps its state and its DOM node.
 */
export const DocumentsLayoutKeepsTheExplorerMounted: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    await viewport(1440, 900);
    const folder = await canvas.findByRole('button', { name: /^notes$/ });
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(folder);
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    const route = canvas.getByLabelText('Bieżąca trasa');

    // List -> document: same explorer instance, folder still collapsed.
    await userEvent.click(await canvas.findByRole('button', { name: /^specification.md/ }));
    await waitFor(() => expect(route).toHaveTextContent('/documents/spec'));
    await expect(canvas.getByRole('button', { name: /^notes$/ })).toBe(folder);
    await expect(folder.isConnected).toBe(true);
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByRole('button', { name: /^specification.md/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    // Document -> document: still the same instance; the selection follows the route.
    await userEvent.click(folder);
    await userEvent.click(await canvas.findByRole('button', { name: /^CLIENT.TXT$/ }));
    await waitFor(() => expect(route).toHaveTextContent('/documents/transcript'));
    await expect(canvas.getByRole('button', { name: /^notes$/ })).toBe(folder);
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('button', { name: /^CLIENT.TXT$/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(canvas.getByRole('button', { name: /^specification.md/ })).not.toHaveAttribute(
      'aria-current',
    );
  },
};
export const DeepLinkSelectsTheDocumentInTheTree: Story = {
  args: { path: '/specs/api-integration/documents/transcript?collection=archive' },
  play: async ({ canvas }) => {
    await viewport(1440, 900);
    // A reload (F5) is a fresh mount at the document URL: the tree selects that document.
    await expect(await canvas.findByRole('button', { name: /^CLIENT.TXT$/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(canvas.getByRole('button', { name: /^specification.md/ })).not.toHaveAttribute(
      'aria-current',
    );
    await expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent('/documents/transcript');
  },
};
export const ClosingADirtyDocumentAsksFirst: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await viewport(1440, 900);
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const input = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(input);
    await userEvent.keyboard('{Control>}{End}{/Control}{Enter}Unsaved line');
    // The region's close closes every tab, asking once about the unsaved documents.
    const close = () =>
      userEvent.click(canvas.getByRole('button', { name: 'Zamknij wszystkie dokumenty' }));
    const dialog = () => within(document.body).findByRole('alertdialog');

    // Keep editing: the pane and the draft stay.
    await close();
    let choice = await dialog();
    for (const name of ['Kontynuuj edycję', 'Odrzuć wszystkie', 'Zapisz wszystkie'])
      await expect(within(choice).getByRole('button', { name })).toBeVisible();
    await expect(within(choice).getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(within(choice).getByRole('button', { name: 'Kontynuuj edycję' }));
    await waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toHaveTextContent(
      'Unsaved line',
    );

    // Discard all: every tab closes and the draft is gone.
    await close();
    choice = await dialog();
    await userEvent.click(within(choice).getByRole('button', { name: 'Odrzuć wszystkie' }));
    await waitFor(() =>
      expect(canvas.queryByRole('textbox', { name: 'Treść specification.md' })).toBeNull(),
    );
    await expect(canvas.queryByRole('tab')).toBeNull();
    await userEvent.click(await canvas.findByRole('button', { name: /^specification.md/ }));
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-workspace-surface="secondary"]')).not.toBeNull(),
    );
    await expect(canvas.queryByText(/Unsaved line/)).toBeNull();
    await expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  },
};
/** Opens a document from the tree by its name (wide: the tree is always there). */
const openFromTree = async (
  canvas: StoryContext['canvas'],
  userEvent: StoryContext['userEvent'],
  name: RegExp,
) => userEvent.click(await canvas.findByRole('button', { name }));

/**
 * Several documents open at once, wide: one tab per document, a dirty badge that survives tab
 * switches, a per-tab close question, and a document that disappeared stays open as missing.
 */
export const MultiTabWide: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive', threeDocuments: true },
  play: async ({ canvas, userEvent }) => {
    await viewport(1440, 900);
    await openFromTree(canvas, userEvent, /^specification.md/);
    await openFromTree(canvas, userEvent, /^CLIENT.TXT$/);
    await openFromTree(canvas, userEvent, /^plan.md/);
    await waitFor(() => expect(canvas.getAllByRole('tab')).toHaveLength(3));
    await expect(canvas.getByRole('tab', { name: /plan.md/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Edit the specification in its own tab; the other tabs stay clean.
    await userEvent.click(canvas.getByRole('tab', { name: /specification.md/ }));
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    const input = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(input);
    await userEvent.keyboard('{Control>}{End}{/Control}{Enter}Tab draft');
    await expect(
      await canvas.findByRole('tab', { name: /specification.md.*niezapisane zmiany/i }),
    ).toBeVisible();
    // Switching away and back asks nothing and keeps the draft.
    await userEvent.click(canvas.getByRole('tab', { name: /plan.md/ }));
    await expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await userEvent.click(canvas.getByRole('tab', { name: /specification.md/ }));
    await expect(
      await canvas.findByRole('textbox', { name: 'Treść specification.md' }),
    ).toHaveTextContent('Tab draft');
    // A document removed behind the back of the user stays open, marked as missing.
    tabsControl.removeExternally('transcript');
    await waitFor(() =>
      expect(canvas.getByRole('tab', { name: /CLIENT.TXT.*nie znaleziono/i })).toBeVisible(),
    );
    // Closing the dirty tab asks for THAT tab; Keep editing leaves it open.
    await userEvent.click(canvas.getByRole('button', { name: /^Zamknij specification.md/ }));
    const dialog = await within(document.body).findByRole('alertdialog');
    await expect(dialog).toHaveTextContent('specification.md');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kontynuuj edycję' }));
    await waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
    await expect(canvas.getAllByRole('tab')).toHaveLength(3);
  },
};

/** Narrow: no strip. The document header carries the `name (N)` switcher; Back keeps the tabs. */
export const MultiTabNarrow: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive', threeDocuments: true },
  play: async ({ canvas, userEvent }) => {
    await viewport(390, 844);
    await openFromTree(canvas, userEvent, /^specification.md/);
    await userEvent.click(await canvas.findByRole('button', { name: 'Wróć do listy dokumentów' }));
    await openFromTree(canvas, userEvent, /^plan.md/);
    const switcher = await canvas.findByRole('button', { name: /plan.md, otwarte: 2/ });
    await expect(canvas.queryByRole('tab')).toBeNull();
    await userEvent.click(switcher);
    const menu = await within(document.body).findByRole('menu');
    const stacked = document.querySelector('[data-workspace-surface="secondary"]');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /^specification.md/ }));
    await canvas.findByRole('button', { name: /specification.md, otwarte: 2/ });
    // A tab switch follows the route inside the open stacked screen: it is not rebuilt.
    await expect(document.querySelector('[data-workspace-surface="secondary"]')).toBe(stacked);
    // Back returns to the tree without closing anything.
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do listy dokumentów' }));
    await openFromTree(canvas, userEvent, /^plan.md/);
    await canvas.findByRole('button', { name: /plan.md, otwarte: 2/ });
  },
};

/** A deep link to a document that does not exist: a clear alert inside the panel, closing the tab. */
export const MissingDocumentDeepLink: Story = {
  args: { path: '/specs/api-integration/documents/nie-ma-takiego?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    await viewport(1440, 900);
    const alert = await canvas.findByText('Nie znaleziono dokumentu');
    await expect(alert).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Zamknij kartę' }));
    await waitFor(() => expect(canvas.queryByRole('tab')).toBeNull());
    await expect(canvas.getByLabelText('Bieżąca trasa')).not.toHaveTextContent('nie-ma-takiego');
  },
};

/**
 * Stacked: the header is Back, the switcher, the contents icon, Edit and the menu. The region close
 * (a second way back) is gone; the contents sheet and its Display item are there for 2+ headings.
 */
export const NarrowHeaderHasContentsAndNoDuplicateClose: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive', threeDocuments: true },
  play: async ({ canvas, userEvent }) => {
    await viewport(390, 844);
    await openFromTree(canvas, userEvent, /^plan.md/);
    await canvas.findByRole('button', { name: 'Wróć do listy dokumentów' });
    await expect(canvas.queryByRole('button', { name: 'Zamknij wszystkie dokumenty' })).toBeNull();
    const icon = await canvas.findByRole('button', { name: 'Otwórz spis treści' });
    await userEvent.click(icon);
    const sheet = await within(document.body).findByRole('dialog', { name: 'Spis treści (4)' });
    await userEvent.click(within(sheet).getByRole('link', { name: 'Etap 3' }));
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Etap 3'));
    // Plain text has no contents.
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do listy dokumentów' }));
    await openFromTree(canvas, userEvent, /^CLIENT.TXT$/);
    await canvas.findByRole('textbox', { name: 'Treść notes/CLIENT.TXT' });
    await expect(canvas.queryByRole('button', { name: 'Otwórz spis treści' })).toBeNull();
  },
};

/** Medium (split, document panel below the column threshold): strip, contents icon and the close. */
export const MediumHeaderHasContentsIconAfterTheStrip: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive', threeDocuments: true },
  play: async ({ canvas, userEvent }) => {
    await viewport(1280, 900);
    await openFromTree(canvas, userEvent, /^plan.md/);
    await waitFor(() => expect(canvas.getAllByRole('tab')).toHaveLength(1));
    const icon = await canvas.findByRole('button', { name: 'Otwórz spis treści' });
    const tab = canvas.getByRole('tab');
    await expect(icon.getBoundingClientRect().left).toBeGreaterThan(
      tab.getBoundingClientRect().right,
    );
    await expect(canvas.getByRole('button', { name: 'Zamknij wszystkie dokumenty' })).toBeVisible();
  },
};

/** A long document title must not push the contents sheet beyond the screen (390 and 320 px). */
export const ContentsSheetKeepsALongTitleInsideTheScreen: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive', threeDocuments: true },
  play: async ({ canvas, userEvent }) => {
    for (const width of [390, 320]) {
      await viewport(width, 800);
      const back = canvas.queryByRole('button', { name: 'Wróć do listy dokumentów' });
      if (back) await userEvent.click(back);
      await openFromTree(canvas, userEvent, /^adr-001.md/);
      await userEvent.click(await canvas.findByRole('button', { name: 'Otwórz spis treści' }));
      const sheet = await within(document.body).findByRole('dialog');
      const list = within(sheet).getByRole('list');
      await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + 1);
      const sheetRight = sheet.getBoundingClientRect().right;
      for (const link of within(sheet).getAllByRole('link')) {
        const box = link.getBoundingClientRect();
        await expect(box.right).toBeLessThanOrEqual(sheetRight + 1);
        await expect(box.right).toBeLessThanOrEqual(window.innerWidth + 1);
      }
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    }
  },
};

export const WorkspaceChromeIsPolishOnCreate: Story = {
  args: { path: '/specs/new?collection=archive' },
  play: async ({ canvas }) => {
    await viewport(390, 844);
    await canvas.findByRole('button', { name: 'Otwórz nawigację' });
    await expect(canvas.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  },
};
export const ShortCreateAndBranch: Story = {
  args: { path: '/specs/new?collection=archive' },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await viewport(1440, 900);
    await canvas.findByRole('button', { name: /Samodzielnie/ });
    await settleViewport();
    await viewport(390, 430);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await expect(canvas.getByRole('heading', { name: 'Co chcesz opisać?' })).toHaveFocus();
    const input = canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' });
    await userEvent.click(input);
    await userEvent.type(input, 'Logowanie SSO');
    input.scrollIntoView({ block: 'center' });
    const root = input.closest('[data-scroll-area]');
    void root;
    await settleViewport(390, 430);
    await expect(document.scrollingElement?.scrollTop).toBe(0);
    await expect(input.getBoundingClientRect().bottom).toBeLessThan(430);
    await expect(input.getBoundingClientRect().top).toBeGreaterThan(50);
    await viewport(390, 844);
    // The default new workspace is preselected; the main workspace is one click away.
    await expect(await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
    await userEvent.click(canvas.getByRole('radio', { name: 'Bieżący katalog' }));
    await expect(canvas.getByRole('radio', { name: 'Bieżący katalog' })).toBeChecked();
    await expect(
      canvas.getByRole('group', { name: 'Podsumowanie środowiska pracy' }),
    ).toHaveTextContent('nie przełączamy aktualnej gałęzi');
    await settleViewport(390, 844, () =>
      canvas.getByRole('button', { name: 'Utwórz specyfikację' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Zmień sposób pracy' }));
    await userEvent.click(canvas.getByRole('link', { name: 'Wszystkie specyfikacje' }));
    await expect(within(document.body).getByRole('alertdialog')).toBeVisible();
    await userEvent.click(within(document.body).getByRole('button', { name: 'Kontynuuj' }));
    await userEvent.click(canvas.getByRole('button', { name: /Samodzielnie/ }));
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Logowanie SSO',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Utwórz specyfikację' }));
    // A newly created document opens in Preview by default.
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent('collection=archive');
    void canvasElement;
  },
};
/** The nearest scrollable ancestor of an element. */
function scrollerOf(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1)
      return node;
  }
  return undefined;
}
/**
 * Owner 7A (P1): a failed create at the bottom of the form on a phone. The error and the retry
 * button must be on screen without searching. Regression test: it could not be reproduced as a
 * defect (the failure region is scrolled into view), so this pins the behaviour.
 */
export const FailedCreateAtTheBottomStaysVisible: Story = {
  args: { path: '/specs/new?collection=archive', createOutcome: 'failure' },
  play: async ({ canvas, userEvent }) => {
    await viewport(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Logowanie SSO',
    );
    const submit = await canvas.findByRole('button', { name: 'Utwórz specyfikację' });
    const scroller = scrollerOf(submit);
    if (!scroller) throw new Error('The create form has no scroller at 390x844');
    // The user is at the very bottom, where the primary button lives.
    scroller.scrollTop = scroller.scrollHeight;
    await waitFor(() =>
      expect(scroller.scrollTop + scroller.clientHeight).toBeGreaterThanOrEqual(
        scroller.scrollHeight - 1,
      ),
    );
    await userEvent.click(submit);
    const alert = await canvas.findByRole('alert', {}, { timeout: 5000 });
    await expect(alert).toHaveTextContent('Nie udało się utworzyć specyfikacji');
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const retry = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
    const floating = document.querySelector('.mobile-floating-navigation');
    const top = floating ? floating.getBoundingClientRect().bottom : 0;
    for (const element of [alert, retry]) {
      const rect = element.getBoundingClientRect();
      await expect(rect.top).toBeGreaterThanOrEqual(top - 1);
      await expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    }
  },
};
/**
 * The Create CTA uses the DS Button `wrap` label mode: a long (translated) label wraps inside the
 * 320px column instead of overflowing, and a normal label keeps the standard control height.
 */
export const CreateCtaWrapsAt320: Story = {
  args: { path: '/specs/new?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    await viewport(320, 640);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    const submit = await canvas.findByRole('button', { name: 'Utwórz specyfikację' });
    const standard = submit.getBoundingClientRect().height;
    await expect(submit.getBoundingClientRect().right).toBeLessThanOrEqual(320);
    // A long translation: same width, more lines, nothing clipped or overflowing.
    const label = [...submit.querySelectorAll('span')].find((node) => node.children.length === 0);
    if (!label) throw new Error('Button label span missing');
    label.textContent =
      'Utwórz specyfikację i od razu otwórz pierwszą sesję z agentem Spec Writer w nowym środowisku pracy';
    await waitFor(() =>
      expect(submit.getBoundingClientRect().height).toBeGreaterThan(standard * 1.5),
    );
    const rect = submit.getBoundingClientRect();
    await expect(rect.right).toBeLessThanOrEqual(320);
    await expect(submit.scrollWidth).toBeLessThanOrEqual(submit.clientWidth);
    await expect(submit.scrollHeight).toBeLessThanOrEqual(submit.clientHeight);
  },
};
/** K1: a hash target (Zadania) lands below the floating navigation row on a phone. */
export const HashAnchorClearsTheFloatingRow: Story = {
  args: { path: '/specs/api-integration?collection=current' },
  // The overview section headings (h3 under the page h1) are a known open item, not this story's subject.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
  play: async ({ canvas, userEvent }) => {
    await viewport(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Otwórz nawigację/ }));
    await userEvent.click(await within(document.body).findByRole('link', { name: /^Zadania/ }));
    const heading = await waitFor(
      () => {
        const element = document.getElementById('tasks-heading');
        if (!element) throw new Error('Tasks section missing');
        return element;
      },
      { timeout: 5000 },
    );
    await waitFor(
      () => {
        const floating = document.querySelector('.mobile-floating-navigation');
        const bottom = floating ? floating.getBoundingClientRect().bottom : 0;
        if (heading.getBoundingClientRect().top < bottom - 1)
          throw new Error('Tasks heading is under the floating row');
        if (document.activeElement !== heading)
          throw new Error('Focus has not reached the section');
      },
      { timeout: 5000 },
    );
  },
};
export const SessionContextRoundTrip: Story = {
  args: { path: '/specs/api-integration/sessions/session?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    await viewport(1440, 900);
    const composer = await canvas.findByRole('textbox', { name: 'Wiadomość do Spec Writera' });
    await userEvent.type(composer, 'Zachowany szkic wiadomości');
    await userEvent.click(canvas.getByRole('button', { name: /Dokumenty Pliki/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Specification specification.md/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Otwórz w Documents' }));
    // The document opens in Preview by default.
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.click(canvas.getByRole('link', { name: 'Sesja Spec Writera' }));
    await expect(
      await canvas.findByRole('textbox', { name: 'Wiadomość do Spec Writera' }),
    ).toHaveValue('Zachowany szkic wiadomości');
    await expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent('collection=archive');
    await settleViewport();
    await viewport(390);
    await settleViewport(390, 844);
  },
};
export const LoadingShell: Story = {
  args: { path: '/specs/new?collection=current', catalogueState: 'loading' },
  play: async ({ canvas }) => {
    await canvas.findByText('Wczytywanie konfiguracji…');
    await expect(canvas.getByRole('link', { name: 'Wszystkie specyfikacje' })).toBeVisible();
    await settleViewport(390, 844);
  },
};
export const ErrorShell: Story = {
  args: { path: '/specs/new?collection=current', catalogueState: 'error' },
  play: async ({ canvas }) => {
    await canvas.findByText('Nie udało się wczytać konfiguracji');
    await expect(canvas.getByRole('link', { name: 'Wszystkie specyfikacje' })).toBeVisible();
    await settleViewport(390, 844);
  },
};
export const NewWorkspaceUnavailableByConfiguration: Story = {
  args: { path: '/specs/new?collection=current', optionsVariant: 'git-disabled' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    // Unavailable but reachable: aria-disabled with the reason as its description.
    const tile = await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' });
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
    await expect(tile).not.toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Bieżący katalog' })).toBeChecked();
    await settleViewport(390, 844, () => canvas.getByText('Wyłączone w konfiguracji projektu.'));
  },
};

export const LaterSessionConfiguration: Story = {
  args: { path: '/specs/api-integration/sessions/new?collection=archive' },
  play: async ({ canvas, userEvent }) => {
    await viewport(390, 844);
    await canvas.findByRole('heading', { name: 'Z kim chcesz pracować?' });
    await expect(canvas.queryByText(/wykonawcę pierwszej sesji/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'codex model A' }),
    );
    await settleViewport(390, 844);
    await userEvent.click(canvas.getByRole('link', { name: 'Sesje' }));
    const dialog = await within(document.body).findByRole('alertdialog');
    await expect(dialog).toHaveTextContent('Porzucić konfigurację?');
    await expect(dialog).toHaveTextContent('Niezapisane ustawienia zostaną utracone.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kontynuuj' }));
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'codex model A',
    );
  },
};
export const DocumentFocusAndDisclosure: Story = {
  play: async ({ canvas, userEvent }) => {
    await viewport(320, 740);
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    const input = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await userEvent.type(input, 'draft');
    await invokeDocumentAction(canvas, userEvent, 'Zapisz');
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, 'discard');
    await invokeDocumentAction(canvas, userEvent, 'Cofnij zmiany');
    await userEvent.click(within(document.body).getByRole('button', { name: 'Odrzuć zmiany' }));
    await waitFor(() => expect(input).toHaveFocus());
    // No path disclosure: the file name is the single header title.
    await expect(canvas.queryByRole('button', { name: /^Ścieżka dokumentu/ })).toBeNull();
    await settleViewport(320, 740);
  },
};

export const LongDocumentPosition: Story = {
  args: { longDocument: true },
  play: async ({ canvas, userEvent }) => {
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    await viewport(1440, 900);
    const input = await canvas.findByRole('textbox', { name: 'Treść specification.md' });
    const view = EditorView.findFromDOM(input.closest('.cm-editor')!)!;
    // Initial routing, ResizeObserver and CM measurement must settle before
    // arranging the user's scroll; otherwise the test scrolls an old-width view.
    await waitFor(async () => {
      const width = view.scrollDOM.clientWidth;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (width !== view.scrollDOM.clientWidth || width < 800)
        throw new Error('Initial wide editor geometry pending');
    });
    view.dispatch({ selection: { anchor: 1200 } });
    // A wheel gesture marks the scroll as the user's even right after the viewport resize.
    view.scrollDOM.dispatchEvent(new Event('wheel'));
    view.scrollDOM.scrollTop = 500;
    view.scrollDOM.dispatchEvent(new Event('scroll'));
    await waitFor(() => {
      if (view.scrollDOM.scrollTop < 100) throw new Error('Expected a scrolled source document');
    });
    // Capture the semantic scroll anchor after CodeMirror's own layout measure,
    // not between a scroll event and its deferred line-wrap measurement.
    // The anchor is a source line (the same line stays on top across widths), not a character offset.
    const topLine = (editor: EditorView) =>
      editor.state.doc.lineAt(
        editor.lineBlockAtHeight(
          Math.max(0, editor.scrollDOM.scrollTop - editor.documentPadding.top),
        ).from,
      ).number;
    const scroll = await new Promise<number>((resolve) =>
      view.requestMeasure({
        read: () => topLine(view),
        write: (anchor) => resolve(anchor),
      }),
    );
    await viewport(390, 844);
    const next = EditorView.findFromDOM(
      (await canvas.findByRole('textbox', { name: 'Treść specification.md' })).closest(
        '.cm-editor',
      )!,
    )!;
    await waitFor(() => {
      if (Math.abs(topLine(next) - scroll) > 1 || next.state.selection.main.anchor !== 1200)
        throw new Error(
          `Caret or scroll changed on handoff: line ${topLine(next)} vs ${scroll}, caret ${next.state.selection.main.anchor}`,
        );
    });
  },
};

function BrowserPopFixture() {
  const [target, setTarget] = useState<Window>();
  return (
    <>
      <iframe
        hidden
        title="Isolated browser history test"
        src="/__vitest__/favicon.svg"
        onLoad={(event) => {
          const win = event.currentTarget.contentWindow;
          if (win) setTarget(win);
        }}
      />
      {target && (
        <Connected
          path="/specs/new?collection=archive"
          historyFromOverview
          browserWindow={target}
        />
      )}
    </>
  );
}
export const HistoryPopPreservesConfiguration: Story = {
  render: () => <BrowserPopFixture />,
  args: { path: '/specs/new?collection=archive', historyFromOverview: true },
  play: async ({ canvas, userEvent }) => {
    await viewport(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Historia konfiguracji',
    );
    const nativeWindow = canvas.getByTitle<HTMLIFrameElement>(
      'Isolated browser history test',
    ).contentWindow!;
    const nativeHref = () => nativeWindow.location.pathname + nativeWindow.location.search;
    await waitFor(() => expect(nativeHref()).toBe('/specs/new?collection=archive'));
    const ownedEntry = JSON.stringify(nativeWindow.history.state);
    historyControl.back();
    const first = await within(document.body).findByRole('alertdialog');
    await userEvent.click(within(first).getByRole('button', { name: 'Kontynuuj' }));
    await expect(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Historia konfiguracji',
    );
    await expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent(
      '/specs/new?collection=archive',
    );
    // Router state stays on Create while blocking. Native POP cancellation
    // still restores its entry asynchronously; do not issue another back until
    // that actual iframe entry (URL and state) is restored.
    await waitFor(async () => {
      await expect(nativeHref()).toBe('/specs/new?collection=archive');
      await expect(JSON.stringify(nativeWindow.history.state)).toBe(ownedEntry);
    });
    historyControl.back();
    const second = await within(document.body).findByRole('alertdialog');
    await userEvent.click(within(second).getByRole('button', { name: 'Porzuć konfigurację' }));
    await waitFor(() =>
      expect(canvas.getByLabelText('Bieżąca trasa')).toHaveTextContent('/?collection=archive'),
    );
    await expect(
      canvas.queryByRole('textbox', { name: 'Nazwa specyfikacji' }),
    ).not.toBeInTheDocument();
  },
};
export const LongFilenameHeader: Story = {
  args: { longFilename: true },
  play: async ({ canvas }) => {
    await viewport(320, 740);
    await waitForDocumentActions(canvas);
    // The long file name is truncated in the single header; nothing overflows the viewport.
    const title = await canvas.findByRole('heading', {
      name: 'architecture-decisions-and-client-authentication-interview.md',
    });
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
    await settleViewport(320, 740);
  },
};

export const DocumentsIdleSecondary: Story = {
  args: { path: '/specs/api-integration/documents?collection=archive' },
  play: async ({ canvas }) => {
    // Split-capable wide viewport: Secondary is visible with a truthful idle placeholder
    // instead of letting the Primary tree expand to a full-width standalone list.
    await viewport(1440, 900);
    await expect(
      (await canvas.findAllByRole('button', { name: /^Akcje: / })).length,
    ).toBeGreaterThan(0);
    await expect(canvas.getByText('Wybierz dokument z drzewa')).toBeVisible();
    // A few documents to start from, as buttons that open a tab (nothing opens by itself).
    await expect(canvas.getByRole('button', { name: 'Otwórz specification.md' })).toBeVisible();
    await expect(canvas.queryByRole('tab')).toBeNull();
    await settleViewport();
    // Narrow: the tree remains the sole visible Primary; no idle Secondary placeholder.
    await viewport(390, 844);
    await expect(canvas.queryByText('Wybierz dokument z drzewa')).not.toBeInTheDocument();
    await settleViewport(390, 844);
  },
};

export { Connected as ConnectedApplication };
