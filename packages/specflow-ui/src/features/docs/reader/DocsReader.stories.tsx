import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { createFixtureSpecsOverviewApi } from '../../../../test-support/specs/overview/api';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowRouter } from '../../../app/router';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { createAuthStore } from '../../../auth/store';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import type { CurrentWorkspaceState } from '../current-workspace/currentWorkspace';
import { currentDocsWorkspace } from '../current-workspace/currentWorkspaceStore';
import {
  createFixtureDocsApi,
  fixtureWorkspaceList,
  type ReaderFixtureScenario,
} from './readerFixtureApi.stories-support';

/*
 * The documentation reader composed through the real application: router, App Shell, navigation,
 * query client and the reader's own ports, served by an in-memory fixture Runtime. Resize the frame
 * (or use the viewport toolbar) for Wide, Compact and Narrow.
 */

interface ReaderStoryArgs {
  /** The address the tab opens. */
  path: string;
  scenario: ReaderFixtureScenario;
  /** Only the project folder is registered (no picker). */
  single?: boolean;
  /** The tab's current workspace before the address is opened (session storage). */
  remembered?: CurrentWorkspaceState;
  /** Entered from a Session's Context (the way back, "this Session's workspace"). */
  fromSession?: boolean;
  /** Workspaces listed as available whose checkout answers `409`. */
  unavailable?: string[];
  /** The address was opened from the reader itself (the document existed then). */
  fromReader?: boolean;
  /** This document goes away the moment it is read. */
  removeOnRead?: string;
}

/** The router of the story on screen, so a play function can step browser history. */
let storyRouter: ReturnType<typeof createSpecFlowRouter> | undefined;
const router = () => {
  if (!storyRouter) {
    throw new Error('No story router');
  }

  return storyRouter;
};

/** The Specification `sso`, bound to the ui-1234 worktree. */
const ssoWorkspace = createWorkspaceIntegrationApi();
const specificationApi = {
  getSpecificationWorkspace: async () => {
    const dto = await ssoWorkspace.getSpecificationWorkspace('api-integration');

    return {
      ...dto,
      workspaceId: 'ws-sso',
      specification: {
        ...dto.specification,
        title: 'Single sign-on with the corporate identity provider',
      },
    };
  },
};

function ReaderScreen({
  path,
  scenario,
  single,
  remembered,
  fromSession,
  unavailable,
  fromReader,
  removeOnRead,
}: ReaderStoryArgs) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    const defaults = createSpecFlowAppServices();
    const authStore = createAuthStore(defaults.authApi, {
      authenticationRequired: false,
      authenticated: false,
      user: { id: 'story', name: 'Demo' },
      loginMethods: { password: { enabled: false }, oidc: [] },
    });
    const services = createSpecFlowAppServices({
      authStore,
      specsOverviewApi: createFixtureSpecsOverviewApi(),
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
      workspaceApi: { list: () => Promise.resolve(fixtureWorkspaceList({ single })) },
      specificationApi,
      docsApi: createFixtureDocsApi(scenario, { unavailable, removeOnRead }),
    });
    // The tab's store is per browser tab: each story starts from its own value.
    currentDocsWorkspace.replace(remembered ?? { source: 'project-folder' });
    const history = createMemoryHistory({ initialEntries: [path] });
    if (fromSession) {
      currentDocsWorkspace.enterSession();
      history.replace('/docs', {
        docsReader: {
          source: 'session',
          sessionId: 's-42',
          sessionTitle: 'Fix the login redirect after token refresh',
        },
      });
    }

    if (fromReader) {
      history.replace(path, { docsReader: { fromReader: true } });
    }

    storyRouter = createSpecFlowRouter(history, services);

    return { query, router: storyRouter };
  }, [path, scenario, single, remembered, fromSession, unavailable, fromReader, removeOnRead]);

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

const main = '/workspaces/ws-main/docs';
const meta = {
  title: 'SpecFlow/Screens/Documentation reader',
  component: ReaderScreen,
  tags: ['contract'],
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
  args: { path: '/docs', scenario: 'reader' },
} satisfies Meta<typeof ReaderScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

/** First view: the tree and, on split layouts, the documentation's root index. */
export const Default: Story = {
  tags: ['!contract'],
  argTypes: {
    path: {
      control: 'select',
      options: [
        '/docs',
        `${main}/product.specflow.ui.interaction-model`,
        `${main}/architecture.runtime.workspace-registry`,
        '/workspaces/ws-sso/docs/product.specflow.ui.authentication-recovery',
      ],
    },
    scenario: {
      control: 'select',
      options: [
        'reader',
        'no-root-index',
        'loading',
        'not-configured',
        'empty-corpus',
        'skipped-one',
        'skipped-many',
        'forbidden',
        'docs-unavailable',
        'index-building',
      ],
    },
  },
};
export const Article: Story = { args: { path: `${main}/product.specflow.ui.interaction-model` } };
/** An address with a section opens the article at that section, focus on its heading. */
const sectionLink = `${main}/product.specflow.ui.interaction-model#${encodeURIComponent('ui-interaction-model/back-and-close')}`;
export const SectionDeepLink: Story = {
  args: { path: sectionLink },
};
/** Opening an address with a section (at a settled width) focuses that section's heading. */
export const SectionDeepLinkFocus: Story = {
  args: { path: main },
  play: async () => {
    await settleViewport(1440, 900);
    await screen().findByRole('heading', { level: 1, name: 'Nevo SpecFlow documentation' });
    router().history.push(sectionLink);
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Back and Close'));
    await expect(document.activeElement?.tagName).toBe('H2');
  },
};
export const LongTitle: Story = {
  args: { path: `${main}/architecture.runtime.workspace-registry` },
};
export const NonAuthoritativeDocument: Story = {
  args: { path: `${main}/ideas.semantic-docs.surfaces-and-setup` },
};
export const FeatureWorktree: Story = {
  args: { path: '/workspaces/ws-sso/docs/product.specflow.ui.authentication-recovery' },
};
export const SkippedOne: Story = { args: { scenario: 'skipped-one' } };
export const SkippedMany: Story = { args: { scenario: 'skipped-many' } };
export const IndexBuilding: Story = { args: { scenario: 'index-building' } };
export const NoRootIndex: Story = { args: { scenario: 'no-root-index' } };
export const SingleWorkspace: Story = { args: { single: true } };
export const Loading: Story = {
  args: { scenario: 'loading', path: `${main}/product.specflow.ui.interaction-model` },
};
export const NotConfigured: Story = {
  args: { scenario: 'not-configured', path: '/workspaces/ws-reader/docs' },
};
export const EmptyCorpus: Story = {
  args: { scenario: 'empty-corpus', path: '/workspaces/ws-reader/docs' },
};
export const DocsUnavailable: Story = { args: { scenario: 'docs-unavailable' } };
export const Forbidden: Story = { args: { scenario: 'forbidden' } };
export const UnknownDocument: Story = {
  args: { path: `${main}/product.specflow.ui.single-sign-on` },
};
export const SupersededDocument: Story = {
  args: { path: `${main}/product.specflow.ui.navigation-v0` },
};
/** A pick the list allowed, but the checkout cannot be read now: the attention Alert. */
export const PickedWorkspaceUnavailable: Story = {
  args: {
    path: '/workspaces/ws-reader/docs',
    unavailable: ['ws-reader'],
    remembered: { workspaceId: 'ws-reader', source: 'pick' },
  },
};
/** The remembered workspace is registered but unavailable: the project folder, quietly. */
export const RememberedWorkspaceUnavailable: Story = {
  args: { remembered: { workspaceId: 'ws-gone', source: 'remembered' } },
};
/** The remembered workspace is no longer registered. */
export const RememberedWorkspaceRemoved: Story = {
  args: { remembered: { workspaceId: 'ws-removed-long-ago', source: 'remembered' } },
};
/** Entered from a Session's Context: the way back and "this Session's workspace". */
export const SessionEntry: Story = { args: { fromSession: true } };

const screen = () => within(document.body);

/** The scrolling ancestor of an element (the article's own scroll area). */
function scrollerOf(element: HTMLElement): HTMLElement {
  let node = element.parentElement;
  while (node && !/auto|scroll/.test(getComputedStyle(node).overflowY)) {
    node = node.parentElement;
  }

  if (!node) {
    throw new Error('No scrolling ancestor');
  }

  return node;
}

/** Picking another workspace reloads the tree and keeps the open document's id. */
export const PickerReloadsTree: Story = {
  args: { path: `${main}/product.specflow.ui.authentication-recovery` },
  play: async ({ userEvent }) => {
    await settleViewport(1440, 900);
    const body = screen();
    await body.findByRole('heading', { level: 1, name: 'Authentication recovery' });
    const tree = body.getByRole('navigation', { name: 'Documents' });
    await expect(within(tree).queryByRole('button', { name: /^Single sign-on/ })).toBeNull();
    await userEvent.click(body.getByRole('button', { name: /nevo-specflow/ }));
    await userEvent.click(
      await body.findByRole('option', { name: /ui-1234-single-sign-on-with-the-corporate/ }),
    );
    // The worktree's own tree (it has a Single sign-on document) and its version of the article.
    const reloaded = await body.findByRole('button', { name: /^Single sign-on/ });
    await expect(reloaded.closest('nav')?.getAttribute('aria-label')).toBe('Documents');
    await waitFor(() =>
      expect(body.getByText(/sends the user to the corporate identity provider/)).toBeTruthy(),
    );
  },
};

/** Narrow: a link pushes another article; Back returns to the first at its reading position. */
export const NarrowHopAndBack: Story = {
  args: { path: main },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ userEvent }) => {
    await settleViewport(375, 812);
    const body = screen();
    await userEvent.click(await body.findByRole('button', { name: 'product' }));
    await userEvent.click(await body.findByRole('button', { name: 'specflow' }));
    await userEvent.click(await body.findByRole('button', { name: 'ui' }));
    await userEvent.click(await body.findByRole('button', { name: /UI interaction model/ }));
    const first = await body.findByRole('heading', { level: 1, name: 'UI interaction model' });
    const scroller = scrollerOf(first);
    scroller.scrollTo({ top: 400 });
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(300));
    // The first of the two links (the text's; Related repeats it).
    await userEvent.click(body.getAllByRole('link', { name: 'AI-session UX' })[0]!);
    await body.findByRole('heading', { level: 1, name: 'AI-session UX' });
    await userEvent.click(body.getByRole('button', { name: 'Back to UI interaction model' }));
    // Back to the first article at its reading position.
    const back = await body.findByRole('heading', { level: 1, name: 'UI interaction model' });
    await waitFor(() => expect(scrollerOf(back).scrollTop).toBeGreaterThan(300));
    await userEvent.click(body.getByRole('button', { name: 'Back to documentation' }));
    await body.findByRole('navigation', { name: 'Documents' });
  },
};

/** The tree is one Tab stop; arrows, Home and End move, Right and Left expand and collapse. */
export const TreeKeyboard: Story = {
  args: { path: main },
  play: async ({ userEvent }) => {
    await settleViewport(1440, 900);
    const body = screen();
    const tree = await body.findByRole('navigation', { name: 'Documents' });
    const current = within(tree).getByRole('button', { name: /Nevo SpecFlow documentation/ });
    await expect(current.getAttribute('aria-current')).toBe('page');
    await expect(current.tabIndex).toBe(0);
    await expect(
      within(tree)
        .getAllByRole('button')
        .filter((row) => row.tabIndex === 0),
    ).toHaveLength(1);
    current.focus();
    await userEvent.keyboard('{Home}');
    const first = within(tree).getByRole('button', { name: 'architecture' });
    await expect(document.activeElement).toBe(first);
    await userEvent.keyboard('{ArrowRight}');
    await expect(first.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{ArrowRight}');
    await expect(document.activeElement).not.toBe(first);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(document.activeElement).toBe(first);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(first.getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{End}');
    await expect(document.activeElement?.textContent).toContain('Słownik pojęć');
    await userEvent.keyboard('{Enter}');
    await body.findByRole('heading', { level: 1, name: 'Słownik pojęć' });
  },
};

/**
 * A stray redirect would pull the user back into the reader within a few frames: waiting for the
 * address to leave `/` must keep failing for a bounded time.
 */
async function staysOnSpecifications() {
  await expect(
    waitFor(() => expect(router().state.location.pathname).not.toBe('/'), { timeout: 500 }),
  ).rejects.toThrow();
}

/** Leaving the reader (navigation, then browser Back) lands where the user went, not back in. */
export const LeaveAndComeBack: Story = {
  args: { path: `${main}/product.specflow.ui.interaction-model` },
  play: async ({ userEvent }) => {
    await settleViewport(1440, 900);
    const body = screen();
    await body.findByRole('heading', { level: 1, name: 'UI interaction model' });
    await userEvent.click(body.getByRole('link', { name: 'Specifications' }));
    await waitFor(() => expect(router().state.location.pathname).toBe('/'));
    await staysOnSpecifications();
    router().history.back();
    await waitFor(() =>
      expect(router().state.location.pathname).toBe(
        `${main}/product.specflow.ui.interaction-model`,
      ),
    );
    await body.findByRole('heading', { level: 1, name: 'UI interaction model' });
    router().history.forward();
    await waitFor(() => expect(router().state.location.pathname).toBe('/'));
    await staysOnSpecifications();
  },
};

/**
 * The search: results once typing pauses (a live status with the count), a result opens its
 * section with focus on the heading, the non-authoritative switch keeps focus, Escape returns to
 * the tree with the field focused.
 */
export const SearchFlow: Story = {
  args: { path: main },
  play: async ({ userEvent }) => {
    await settleViewport(1440, 900);
    const body = screen();
    const field = await body.findByRole('searchbox', { name: 'Search documentation' });
    await userEvent.type(field, 'back narrow');
    await waitFor(() => expect(body.getByText('2 documents')).toBeTruthy());
    await expect(body.getByText('2 documents').closest('[role="status"]')).toBeTruthy();
    await userEvent.click(body.getByRole('button', { name: /^UI interaction model/ }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Back and Close'));

    await userEvent.clear(field);
    await userEvent.type(field, 'workspace-aware reader');
    const include = await body.findByRole('button', { name: /^Include \d+ non-authoritative$/ });
    await waitFor(() => expect(body.getAllByText('No matching documents')).toHaveLength(2));
    include.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(body.getByRole('button', { name: 'Leave out non-authoritative' })).toBe(include),
    );
    await expect(document.activeElement).toBe(include);
    await body.findByRole('button', { name: /^Semantic docs search — human reader/ });

    field.focus();
    await userEvent.keyboard('{Escape}');
    await expect((field as HTMLInputElement).value).toBe('');
    await expect(document.activeElement).toBe(field);
    const tree = body.getByRole('navigation', { name: 'Documents' });
    await expect(
      within(tree)
        .getByRole('button', { name: /UI interaction model/ })
        .getAttribute('aria-current'),
    ).toBe('page');
  },
};

/** Picking a workspace without the open document: the note, the root index, the plain address. */
export const PickToMissingDocument: Story = {
  args: { path: '/workspaces/ws-sso/docs/product.specflow.ui.single-sign-on' },
  play: async ({ userEvent }) => {
    await settleViewport(1440, 900);
    const body = screen();
    await body.findByRole('heading', { level: 1, name: 'Single sign-on' });
    await userEvent.click(body.getByRole('button', { name: /Workspace ui-1234/ }));
    await userEvent.click(await body.findByRole('option', { name: /^nevo-specflow/ }));
    await body.findByText('Single sign-on is not in nevo-specflow.');
    await body.findByRole('heading', { level: 1, name: 'Nevo SpecFlow documentation' });
    await waitFor(() => expect(router().state.location.pathname).toBe(main));
  },
};

/** A document opened from the reader that is gone in the next corpus: "no longer in the workspace". */
export const DocumentRemovedWhileReading: Story = {
  args: {
    path: `${main}/ideas.semantic-docs.search-quality`,
    fromReader: true,
    removeOnRead: 'ideas.semantic-docs.search-quality',
  },
};

/** The Specification's compact Documentation row (after its work), on the Overview. */
export const SpecificationEntry: Story = {
  args: { path: '/specs/sso' },
  // The Overview's section headings (h3 under the page h1) are a known open item, not this story's.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
};

/**
 * Below the Wide layout the navigation is a closed Drawer: entering the Specification still makes
 * its workspace the tab's current one, and its Documentation row opens that workspace.
 */
export const SpecificationEntryNarrow: Story = {
  args: { path: '/specs/sso' },
  // The Overview's section headings (h3 under the page h1) are a known open item, not this story's.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ userEvent }) => {
    await settleViewport(375, 812);
    const body = screen();
    const row = await body.findByRole('button', { name: /Documentation/ });
    await waitFor(() =>
      expect(currentDocsWorkspace.get()).toEqual({
        workspaceId: 'ws-sso',
        source: 'specification',
      }),
    );
    await userEvent.click(row);
    await waitFor(() => expect(router().state.location.pathname).toBe('/workspaces/ws-sso/docs'));
    await body.findByText(/^ui-1234-single-sign-on/);
  },
};
