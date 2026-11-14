import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { SpecificationWorkspace } from './SpecificationWorkspace';
import { createFakeWorkspaceRuntime, WorkspaceProvider } from './WorkspaceContext';
import { WorkView } from './WorkView';

type Case = 'attention-session' | 'attention-only' | 'session-only' | 'neither';

function overviewData(kind: Case, history = true): SpecificationWorkspaceData {
  const base = createSpecificationWorkspaceFixture('no-git', 'SPEC-7');
  const attention = kind === 'attention-session' || kind === 'attention-only';
  const session = kind === 'attention-session' || kind === 'session-only';

  return {
    ...base,
    featureAttention: attention
      ? base.featureAttention
      : {
          tasks: { state: 'available', items: [] },
          sessions: { state: 'available', items: [] },
          git: { state: 'unavailable', reason: 'not_implemented' },
        },
    resumeSession: session ? base.resumeSession : undefined,
    sessions: session ? base.sessions : [],
    activityEvents: history ? base.activityEvents : [],
  };
}

function Providers({ children }: { readonly children: React.ReactNode }) {
  const setup = useMemo(
    () => ({ query: createSpecFlowQueryClient(), services: createSpecFlowAppServices({}) }),
    [],
  );

  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        <StoryLocalization locale="en">
          <UiModulesProvider modules={builtInUiModuleRegistry}>{children}</UiModulesProvider>
        </StoryLocalization>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

interface ColumnsFixtureProps {
  /** The Overview content width in CSS px; the threshold is 1408. */
  readonly contentWidth: number;
  readonly kind: Case;
}

/** WorkView alone at an exact content width, so the threshold is tested to the pixel. */
function ColumnsFixture({ contentWidth, kind }: ColumnsFixtureProps) {
  return (
    <Providers>
      <WorkspaceProvider runtime={createFakeWorkspaceRuntime()}>
        <div className="p-4" style={{ width: contentWidth + 32 }}>
          <WorkView data={overviewData(kind)} />
        </div>
      </WorkspaceProvider>
    </Providers>
  );
}

const meta = {
  title: 'SpecFlow/Screens/Specification Workspace/Overview columns',
  component: ColumnsFixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  args: { contentWidth: 1408, kind: 'attention-session' },
} satisfies Meta<typeof ColumnsFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function settle() {
  for (let frame = 0; frame < 4; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function overview(canvasElement: HTMLElement) {
  const root = canvasElement.querySelector<HTMLElement>('[data-overview-columns]');
  assert(root, 'WorkView renders its column marker.');

  return root;
}

function top(canvasElement: HTMLElement, selector: string) {
  const heading = canvasElement.querySelector<HTMLElement>(selector);
  assert(heading, `${selector} is rendered.`);

  return heading.closest('section')!.getBoundingClientRect().top;
}

/** The first rendered section of each column starts on the same line. */
function assertColumnsStartTogether(canvasElement: HTMLElement, workSelector: string) {
  const context = canvasElement.querySelector<HTMLElement>('[data-overview-column="context"]');
  assert(context?.firstElementChild, 'The context column has a section.');
  const contextTop = context.firstElementChild
    .querySelector('section')!
    .getBoundingClientRect().top;
  const workTop = top(canvasElement, workSelector);
  assert(
    Math.abs(contextTop - workTop) <= 1,
    `Both columns start on one line (work ${workTop}, context ${contextTop}).`,
  );
}

async function verifyOneColumn(canvasElement: HTMLElement) {
  await settle();
  assert(overview(canvasElement).dataset.overviewColumns === '1', 'Below 1408 px: one column.');
}

async function verifyTwoColumns(canvasElement: HTMLElement) {
  await settle();
  assert(overview(canvasElement).dataset.overviewColumns === '2', 'From 1408 px: two columns.');
}

export const OneColumnAt1407: Story = {
  args: { contentWidth: 1407 },
  play: async ({ canvasElement }) => {
    await verifyOneColumn(canvasElement);
    // Priority order in one column: the work (attention, Tasks), then Sessions and Documents.
    assert(
      top(canvasElement, '#tasks-summary-heading') < top(canvasElement, '#resume-heading'),
      'Tasks precede Sessions in one column.',
    );
    assert(
      top(canvasElement, '#resume-heading') < top(canvasElement, '#documents-summary-heading'),
      'Sessions precede Documents in one column.',
    );
  },
};

export const TwoColumnsAt1408: Story = {
  args: { contentWidth: 1408 },
  play: async ({ canvasElement }) => {
    await verifyTwoColumns(canvasElement);
    const attention = canvasElement.querySelector<HTMLElement>('[data-requires-attention] h2');
    assert(attention, 'Requires attention is shown, an h2 under the page title.');
    // The work column's slots: Requires attention, then Tasks.
    const attentionBlock = attention.closest('[class*="col-start-1"]')!;
    const tasksBlock = canvasElement
      .querySelector('#tasks-summary-heading')!
      .closest('[class*="col-start-1"]')!;
    // No band: Tasks follow Requires attention directly, whatever the context column holds.
    const gap =
      tasksBlock.getBoundingClientRect().top - attentionBlock.getBoundingClientRect().bottom;
    assert(gap >= 0 && gap <= 1, `Tasks follow Requires attention directly (${gap}px).`);
    assert(
      top(canvasElement, '#resume-heading') < top(canvasElement, '#documents-summary-heading'),
      'Sessions open the context column above Documents.',
    );
    const contextTop = canvasElement
      .querySelector('[data-overview-column="context"]')!
      .getBoundingClientRect().top;
    assert(
      Math.abs(contextTop - attentionBlock.getBoundingClientRect().top) <= 1,
      'Sessions start on the line of Requires attention.',
    );
  },
};

export const AttentionOnlyAt1408: Story = {
  args: { contentWidth: 1408, kind: 'attention-only' },
  play: async ({ canvasElement }) => {
    await verifyTwoColumns(canvasElement);
    assert(!canvasElement.querySelector('#resume-heading'), 'No Session, no Sessions section.');
    // Documents open the context column instead.
    assert(
      canvasElement
        .querySelector('[data-overview-column="context"]')
        ?.firstElementChild?.querySelector('#documents-summary-heading'),
      'Documents open the context column without a Session.',
    );
  },
};

export const SessionOnlyAt1408: Story = {
  // Without Requires attention (h2) the overview section headings are h3 under the page h1: a known
  // open item (see SpecificationSurface.stories PreparingTasks), not this story's subject.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
  args: { contentWidth: 1408, kind: 'session-only' },
  play: async ({ canvasElement }) => {
    await verifyTwoColumns(canvasElement);
    // Nothing requires attention: Tasks start at the top of the work column.
    assertColumnsStartTogether(canvasElement, '#tasks-summary-heading');
  },
};

export const NeitherAt1408: Story = {
  // Without Requires attention (h2) the overview section headings are h3 under the page h1: a known
  // open item (see SpecificationSurface.stories PreparingTasks), not this story's subject.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
  args: { contentWidth: 1408, kind: 'neither' },
  play: async ({ canvasElement }) => {
    await verifyTwoColumns(canvasElement);
    assertColumnsStartTogether(canvasElement, '#tasks-summary-heading');
  },
};

export const NeitherAt1407: Story = {
  // Without Requires attention (h2) the overview section headings are h3 under the page h1: a known
  // open item (see SpecificationSurface.stories PreparingTasks), not this story's subject.
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
  args: { contentWidth: 1407, kind: 'neither' },
  play: async ({ canvasElement }) => verifyOneColumn(canvasElement),
};

const viewports = {
  w1920: { name: '1920', styles: { width: '1920px', height: '1080px' }, type: 'desktop' },
} as const;

/** The composed screen: Activity history decides whether Overview keeps the space. */
function ScreenFixture({ history }: { readonly history: boolean }) {
  return (
    <Providers>
      <div className="h-dvh">
        <AppShell navigation={<div className="p-4">Specification navigation</div>}>
          <SpecificationWorkspace
            specId="SPEC-7"
            data={overviewData('attention-session', history)}
          />
        </AppShell>
      </div>
    </Providers>
  );
}

function historyPanel(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll('h2')].find((heading) =>
    heading.textContent?.includes('Activity history'),
  );
}

/** Empty history at 1920: the Secondary stays closed and Overview uses the space (two columns). */
export const EmptyHistoryLeavesSecondaryClosed: StoryObj<typeof ScreenFixture> = {
  render: (args) => <ScreenFixture {...args} />,
  args: { history: false },
  parameters: { viewport: { options: viewports } },
  globals: { viewport: { value: 'w1920', isRotated: false } },
  play: async ({ canvasElement, canvas, userEvent }) => {
    await settle();
    assert(!historyPanel(canvasElement), 'An empty history does not open the Secondary.');
    await verifyTwoColumns(canvasElement);
    const toggle = await canvas.findByRole('button', { name: 'Activity history' });
    assert(toggle.getAttribute('aria-pressed') === 'false', 'The history control is offered.');

    // Opening it on demand may return Overview to one column.
    await userEvent.click(toggle);
    await settle();
    assert(historyPanel(canvasElement), 'The user can open the empty history.');
    await verifyOneColumn(canvasElement);
  },
};

/** History with entries at 1920: the Secondary keeps its quarter, Overview is one column. */
export const HistoryOpensSecondary: StoryObj<typeof ScreenFixture> = {
  render: (args) => <ScreenFixture {...args} />,
  args: { history: true },
  parameters: { viewport: { options: viewports } },
  globals: { viewport: { value: 'w1920', isRotated: false } },
  play: async ({ canvasElement }) => {
    await settle();
    assert(historyPanel(canvasElement), 'History with entries opens the Secondary by default.');
    await verifyOneColumn(canvasElement);
  },
};
