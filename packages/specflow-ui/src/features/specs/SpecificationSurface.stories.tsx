import { expect, waitFor, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoutedApplication } from '../../app/SpecFlowShell.stories';

// The real router and account/navigation shell, not a substitute detail fixture.
const meta = {
  title: 'SpecFlow/Screens/Specification Workspace',
  component: RoutedApplication,
  parameters: { layout: 'fullscreen' },
  args: { path: '/specs/admission?collection=current' },
  argTypes: {
    path: {
      control: 'select',
      options: [
        '/specs/admission?collection=current',
        '/specs/archive-0?collection=archive',
        '/specs/admission/tasks/TASK-03?collection=current',
        '/specs/admission/repository',
        '/specs/docs-spec/documents',
        '/specs/empty-scaffold',
        '/specs/preparing-spec',
        '/specs/conflict-spec',
        '/specs/no-git-spec',
      ],
    },
    locale: { control: 'inline-radio', options: ['en', 'pl'] },
  },
} satisfies Meta<typeof RoutedApplication>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Working: Story = {
  tags: ['integration'],
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
      level: 1,
    });
    // The Overview previews the Tasks by group; the inventory is the Tasks page. No selection and
    // no bulk Execute (plan 06 F12 is deferred).
    await canvas.findByRole('button', { name: 'All tasks' });
    if (canvasElement.querySelector('[role="checkbox"], input[type="checkbox"]')) {
      throw new Error('The Overview offers no Task selection');
    }
  },
};

export const Current: Story = {
  tags: ['integration'],
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
      level: 1,
    });
    // A peer area (Overview): no Back in the body, and the header keeps the navigation trigger.
    await expect(canvas.queryByRole('link', { name: /All specifications|Back to/ })).toBeNull();
    await expect(canvas.getAllByRole('button', { name: 'Open navigation' }).length).toBeGreaterThan(
      0,
    );
  },
};

/** Activity history on a phone: a stacked screen with one named Back and no Close beside it. */
export const ActivityHistoryNarrow: Story = {
  tags: ['integration'],
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
      level: 1,
    });
    const direct = canvas.queryByRole('button', { name: 'Activity history' });
    if (direct) {
      await userEvent.click(direct);
    } else {
      await userEvent.click(canvas.getAllByRole('button', { name: 'More actions' })[0]!);
      await userEvent.click(
        await within(document.body).findByRole('menuitem', { name: 'Activity history' }),
      );
    }

    const back = await canvas.findByRole('button', { name: 'Back to Overview' });
    await expect(canvas.queryByRole('button', { name: /^Close/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Back' })).toBeNull();
    await userEvent.click(back);
    await canvas.findByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
      level: 1,
    });
  },
};

export const Archive: Story = {
  tags: ['integration'],
  args: { path: '/specs/archive-0?collection=archive' },
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      name: 'Canonical Session, Turn and Work model',
      level: 1,
    });
    canvas.getByRole('link', { name: 'All specifications' });
  },
};

export const EmptyPreparation: Story = {
  tags: ['contract'],
  args: { path: '/specs/empty-scaffold' },
};

export const PreparingTasks: Story = {
  tags: ['contract'],
  args: { path: '/specs/preparing-spec' },
  // The overview section headings (h3 under the page h1) are a known open item, not this story's subject.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
};

export const GitConflicts: Story = {
  tags: ['contract'],
  args: { path: '/specs/conflict-spec' },
};

export const NoGit: Story = {
  tags: ['contract'],
  args: { path: '/specs/no-git-spec' },
};

export const Documents: Story = {
  tags: ['contract'],
  args: { path: '/specs/docs-spec/documents' },
};

/**
 * Routed interaction coverage in a project Runtime: the Documents workspace serves every document
 * route (the same workspace as the demo). A Full Document promoted from the Overview opens as a tab
 * and the way back is the Overview; the Documents list and direct links keep the collection.
 */
export const DocumentReturnNavigation: Story = {
  tags: ['integration'],
  args: { path: '/specs/docs-spec?collection=current', dataMode: 'project' },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('heading', {
      name: 'Odświeżanie sesji i zachowanie kontekstu użytkownika',
      level: 1,
    });
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Obszar: uwierzytelnianie/u }),
    );
    await userEvent.click(await canvas.findByRole('button', { name: 'Open full document' }));
    // The document opens in the Documents workspace (a tab, or the switcher on a narrow strip).
    await canvas.findByRole('tabpanel', {}, { timeout: 5000 });
    await userEvent.click(canvas.getByRole('link', { name: 'Overview' }));
    await canvas.findByRole('heading', {
      name: 'Odświeżanie sesji i zachowanie kontekstu użytkownika',
      level: 1,
    });
  },
};

/**
 * On a phone a document promoted from the Overview is a stacked screen whose header Back names
 * its parent for this visit, the Overview, and returns there: a step back in history, so the
 * Overview comes back at the scroll it was left at, with the focus on its title. Back and Close
 * never appear together.
 */
export const DocumentReturnNavigationNarrow: Story = {
  tags: ['integration'],
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  args: { path: '/specs/docs-spec?collection=archive', dataMode: 'project' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('heading', {
      name: 'Odświeżanie sesji i zachowanie kontekstu użytkownika',
      level: 1,
    });
    const scroller = () =>
      canvasElement.querySelector<HTMLElement>(
        '[data-workspace-surface="primary"] .mobile-workspace-scroll',
      );
    const opener = await canvas.findByRole('button', { name: /^Obszar: uwierzytelnianie/u });
    opener.scrollIntoView({ block: 'center' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const left = scroller()?.scrollTop ?? 0;
    if (left < 40) {
      throw new Error(`The Overview must be scrolled before opening the document (${left}).`);
    }

    await userEvent.click(opener);
    await userEvent.click(await canvas.findByRole('button', { name: 'Open full document' }));
    const back = await canvas.findByRole('button', { name: 'Back to Overview' }, { timeout: 5000 });
    await expect(canvas.queryByRole('button', { name: /^Close/ })).toBeNull();
    await expect(canvas.queryByRole('link', { name: /Specification overview/ })).toBeNull();
    await userEvent.click(back);
    const title = await canvas.findByRole('heading', {
      name: 'Odświeżanie sesji i zachowanie kontekstu użytkownika',
      level: 1,
    });
    // The Overview itself, not the document tree under the stack.
    await expect(canvas.queryByRole('heading', { name: 'Documents', level: 1 })).toBeNull();
    await waitFor(async () => {
      await expect(Math.abs((scroller()?.scrollTop ?? 0) - left)).toBeLessThanOrEqual(2);
      await expect(canvasElement.ownerDocument.activeElement).toBe(title);
    });
  },
};

/** Opening a document from the tree keeps the Archive context of the list. */
export const DocumentBackFromList: Story = {
  tags: ['integration'],
  args: { path: '/specs/docs-spec/documents?collection=archive', dataMode: 'project' },
  play: async ({ canvas, userEvent }) => {
    const tree = await canvas.findAllByRole('button', { name: /\.md/ }, { timeout: 5000 });
    if (!tree[0]) {
      throw new Error('Expected a document in the tree.');
    }

    await userEvent.click(tree[0]);
    await canvas.findByRole('tabpanel', {}, { timeout: 5000 });
    const overview = canvas.getByRole('link', { name: 'Overview' });
    if (!overview.getAttribute('href')?.includes('collection=archive')) {
      throw new Error('The document keeps the Archive context of the list.');
    }
  },
};

/** A direct link on a phone: the document's header Back leads to its parent, the Documents list. */
export const DocumentBackFromDirectLink: Story = {
  tags: ['integration'],
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  args: { path: '/specs/docs-spec/documents/spec?collection=current', dataMode: 'project' },
  play: async ({ canvas, userEvent }) => {
    const back = await canvas.findByRole(
      'button',
      { name: 'Back to Documents' },
      { timeout: 5000 },
    );
    await userEvent.click(back);
    await canvas.findAllByRole('button', { name: /\.md/ }, { timeout: 5000 });
  },
};

export const ArchivedDocumentBackFromDirectLink: Story = {
  tags: ['integration'],
  ...DocumentBackFromDirectLink,
  args: { path: '/specs/docs-spec/documents/spec?collection=archive', dataMode: 'project' },
  play: async ({ canvas, userEvent }) => {
    const back = await canvas.findByRole(
      'button',
      { name: 'Back to Documents' },
      { timeout: 5000 },
    );
    await userEvent.click(back);
    await canvas.findAllByRole('button', { name: /\.md/ }, { timeout: 5000 });
    const overview = canvas.queryAllByRole('link', { name: 'Overview' })[0];
    if (overview && !overview.getAttribute('href')?.includes('collection=archive')) {
      throw new Error('Mobile deep links must preserve Archive context.');
    }
  },
};

export const RepositoryNavigation: Story = {
  tags: ['integration'],
  args: { path: '/specs/admission/repository' },
  play: async ({ canvas, userEvent }) => {
    const toChanges = await canvas.findByRole('button', {
      name: /Go to changes|Przejdź do zmian/i,
    });
    await userEvent.click(toChanges);
    await canvas.findByRole('heading', { name: /Changes|Zmiany/i, level: 1 }, { timeout: 10000 });
  },
};

export const NarrowLongIdentity: Story = {
  tags: ['contract'],
  args: { path: `/specs/${'long-identity-'.repeat(16)}` },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const Polish: Story = { tags: ['contract'], args: { locale: 'pl' } };

/** The Runtime DTOs through the project documents port: tree, then the document's content. */
export const ApiDtoToDocumentScreen: Story = {
  tags: ['integration'],
  args: { path: '/specs/api-integration/documents', integrationDto: true, dataMode: 'project' },
  play: async ({ canvas, userEvent }) => {
    const rows = await canvas.findAllByRole(
      'button',
      { name: /^specification\.md/ },
      { timeout: 10000 },
    );
    if (!rows[0]) {
      throw new Error('Expected specification.md document in tree');
    }

    await userEvent.click(rows[0]);
    await canvas.findByRole(
      'heading',
      { name: 'Document content from Runtime detail API' },
      { timeout: 10000 },
    );
  },
};

export const PendingSpecification: Story = {
  tags: ['contract'],
  args: { path: '/specs/api-integration', integrationDto: true, loadingDelayMs: 30000 },
};
export const PendingTask: Story = {
  tags: ['contract'],
  args: {
    path: '/specs/api-integration/tasks/TASK-01',
    integrationDto: true,
    loadingDelayMs: 30000,
  },
};
export const PendingDocument: Story = {
  tags: ['contract'],
  args: {
    path: '/specs/api-integration/documents/spec',
    integrationDto: true,
    loadingDelayMs: 30000,
  },
};
export const PendingDocuments: Story = {
  tags: ['contract'],
  args: { path: '/specs/api-integration/documents', integrationDto: true, loadingDelayMs: 30000 },
};
export const PendingRepository: Story = {
  tags: ['contract'],
  args: { path: '/specs/api-integration/repository', integrationDto: true, loadingDelayMs: 30000 },
};
