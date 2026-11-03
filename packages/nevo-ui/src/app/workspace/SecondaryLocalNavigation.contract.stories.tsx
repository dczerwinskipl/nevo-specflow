import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Typography } from '../../components';
import { AppShell } from '../shell/AppShell';
import { AppContent, AppWorkspace, AppWorkspaceBody } from './AppWorkspace';
import { defineSecondaryStack } from './SecondaryStack';
import {
  AppWorkspaceProvider,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useSecondaryStack,
} from './WorkspaceContext';
import { WorkspaceHeader } from './WorkspaceHeader';

/**
 * Real-Chromium geometry contracts for the split Secondary's root tabs and local navigation
 * (secondary-navigation.md, "Root tabs and local navigation"; item-tabs.md, "Width"):
 * content-width tabs on a 32 px rail, the active tab marked by its underline and text only, the
 * default one-level back row vs the opt-in breadcrumb trail, long and many tabs, and the
 * stacked/mobile layout that keeps its header Back with no row under it.
 */

const viewports = {
  w360: { name: '360', styles: { width: '360px', height: '780px' }, type: 'mobile' },
  w390: { name: '390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  w1440: { name: '1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
} as const;

// --- Stacks ----------------------------------------------------------------------------------

interface HistoryPages {
  history: Record<never, never>;
  action: { title: string };
}

const actionTitles = Array.from({ length: 40 }, (_, index) => `Read file module-${index}.ts`);

function HistoryList() {
  const stack = useSecondaryStack<HistoryPages>();

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" data-history-scroll="true">
        <ul className="grid gap-1">
          {actionTitles.map((title) => (
            <li key={title}>
              <Button
                onClick={() => void stack.navTo('action', { title })}
                size="sm"
                variant="ghost"
              >
                {title}
              </Button>
            </li>
          ))}
        </ul>
      </AppWorkspaceBody>
    </AppContent>
  );
}

/** Default local navigation (`back`): Work history -> one action, a one-level drill. */
const historyStack = defineSecondaryStack<Record<never, never>, string, HistoryPages>({
  id: 'local-nav-history',
  initial: 'history',
  useData: () => ({ status: 'ready', data: 'history' }),
  screens: {
    history: { title: 'Work history', component: HistoryList },
    action: {
      title: 'Tool action',
      breadcrumbLabel: ({ title }) => title,
      component: ({ params }) => (
        <div className="grid gap-2 p-4" data-action-detail="true">
          <Typography as="h2" variant="title-sm">
            {params.title}
          </Typography>
          <Typography variant="body-sm">Parameters and output.</Typography>
        </div>
      ),
    },
  },
});

interface TaskPages {
  tasks: Record<never, never>;
  task: { taskId: string };
  attempt: { taskId: string; attempt: number };
  review: { taskId: string; attempt: number };
}

function Drill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <div className="p-4">
      <Button onClick={onPress} size="sm" variant="secondary">
        {label}
      </Button>
    </div>
  );
}

/** Opt-in breadcrumbs: every level (Tasks › TASK-03 › Attempt 2 › Review) is a place to return to. */
const tasksStack = defineSecondaryStack<Record<never, never>, string, TaskPages>({
  id: 'local-nav-tasks',
  initial: 'tasks',
  localNavigation: 'breadcrumbs',
  useData: () => ({ status: 'ready', data: 'tasks' }),
  screens: {
    tasks: {
      title: 'Tasks',
      component: () => {
        const stack = useSecondaryStack<TaskPages>();

        return (
          <Drill
            label="Open TASK-03"
            onPress={() => void stack.navTo('task', { taskId: 'TASK-03' })}
          />
        );
      },
    },
    task: {
      title: 'Task',
      breadcrumbLabel: ({ taskId }) => taskId,
      component: ({ params }) => {
        const stack = useSecondaryStack<TaskPages>();

        return (
          <Drill
            label="Open attempt 2"
            onPress={() => void stack.navTo('attempt', { taskId: params.taskId, attempt: 2 })}
          />
        );
      },
    },
    attempt: {
      title: 'Attempt',
      breadcrumbLabel: ({ attempt }) => `Attempt ${attempt}`,
      component: ({ params }) => {
        const stack = useSecondaryStack<TaskPages>();

        return <Drill label="Open review" onPress={() => void stack.navTo('review', params)} />;
      },
    },
    review: {
      title: 'Review',
      component: () => (
        <div className="p-4" data-review-detail="true">
          <Typography variant="body-sm">Rejected review feedback.</Typography>
        </div>
      ),
    },
  },
});

function simpleStack(id: string, label: string) {
  return defineSecondaryStack<Record<never, never>, string, { root: Record<never, never> }>({
    id,
    initial: 'root',
    useData: () => ({ status: 'ready', data: label }),
    screens: {
      root: {
        title: label,
        component: () => (
          <div className="p-4">
            <Typography variant="body-sm">{label}</Typography>
          </div>
        ),
      },
    },
  });
}

const longLabel = 'Specification review notes for the admission readiness policy';
const longStack = simpleStack('local-nav-long', longLabel);
const manyStacks = Array.from({ length: 6 }, (_, index) =>
  simpleStack(`local-nav-file-${index}`, `notes-${index + 1}.md`),
);

// --- Fixture ---------------------------------------------------------------------------------

function PrimaryContent() {
  const navigation = useSecondaryNavigation();

  return (
    <div className="grid justify-items-start gap-2 p-4">
      <Button onClick={() => void navigation.openTab(historyStack, {})} size="sm">
        Open history
      </Button>
      <Button onClick={() => void navigation.openTab(tasksStack, {})} size="sm">
        Open tasks
      </Button>
      <Button onClick={() => void navigation.openTab(longStack, {})} size="sm">
        Open long tab
      </Button>
      <Button
        onClick={() => {
          for (const stack of manyStacks) {
            void navigation.openTab(stack, {});
          }
        }}
        size="sm"
      >
        Open many tabs
      </Button>
    </div>
  );
}

function Workspace() {
  useRegisterPinnedSecondaryTab({ title: 'Context' });

  return (
    <div className="h-dvh">
      <AppShell navigation={<div className="p-4">Navigation</div>}>
        <AppWorkspace
          fit="available"
          split="dynamic"
          labels={{ backToParent: (title) => `Back to ${title}` }}
        >
          <AppWorkspace.Primary header={<WorkspaceHeader title="Conversation" />}>
            <PrimaryContent />
          </AppWorkspace.Primary>
          <AppWorkspace.Secondary header={<WorkspaceHeader title="Context" />}>
            <div className="p-4">
              <Typography variant="body-sm">Pinned context content</Typography>
            </div>
          </AppWorkspace.Secondary>
        </AppWorkspace>
      </AppShell>
    </div>
  );
}

function Fixture() {
  return (
    <AppWorkspaceProvider>
      <Workspace />
    </AppWorkspaceProvider>
  );
}

const meta = {
  title: 'Nevo UI/Layout/Workspace/Secondary local navigation',
  tags: ['contract', '!autodocs'],
  parameters: { layout: 'fullscreen', viewport: { options: viewports } },
  render: () => <Fixture />,
} satisfies Meta;
export default meta;
type Story = StoryObj;

// --- Helpers ---------------------------------------------------------------------------------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function frames(count = 6) {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function waitFor<T>(read: () => T | null | false | undefined, message: string): Promise<T> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = read();
    if (result) {
      return result;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error(message);
}

interface UserEvent {
  click: (element: Element) => Promise<void>;
  keyboard: (text: string) => Promise<void>;
}

const secondary = () =>
  document.querySelector<HTMLElement>(
    '[data-workspace-surface="secondary"][data-workspace-active="true"]',
  ) ?? document.querySelector<HTMLElement>('[data-workspace-surface="secondary"]');
const rail = () => secondary()?.querySelector<HTMLElement>('[data-workspace-tab-rail]') ?? null;
const backRow = () => document.querySelector<HTMLElement>('[data-workspace-back-row]');
const breadcrumbs = () => document.querySelector<HTMLElement>('[data-workspace-breadcrumbs]');
const tabs = () => [...(secondary()?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
const tabNamed = (name: string) =>
  tabs().find((tab) => tab.querySelector('.sr-only')?.textContent === name);

function buttonNamed(name: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === name,
  );
}

async function press(userEvent: UserEvent, name: string) {
  const button = await waitFor(() => buttonNamed(name), `A "${name}" button should render.`);
  await userEvent.click(button);
  await frames();
}

/** Sets the split Secondary to `width` px: Home = the 330 px minimum, then a drag for the rest. */
async function setSecondaryWidth(userEvent: UserEvent, width: number) {
  const splitter = await waitFor(
    () => document.querySelector<HTMLElement>('[data-workspace-splitter="true"]'),
    'The dynamic split renders its splitter.',
  );
  splitter.focus();
  await userEvent.keyboard('{Home}');
  await frames();
  const delta = width - secondary()!.getBoundingClientRect().width;
  if (Math.abs(delta) > 1) {
    const rect = splitter.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointer = (type: string, clientX: number) =>
      splitter.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'mouse',
          button: 0,
          clientX,
          clientY: y,
        }),
      );
    pointer('pointerdown', x);
    pointer('pointermove', x - delta);
    pointer('pointerup', x - delta);
    await frames();
  }

  const actual = secondary()!.getBoundingClientRect().width;
  assert(Math.abs(actual - width) <= 2, `Secondary should be ${width}px wide (got ${actual}).`);
}

/**
 * The rail contract at the current width: 32 px, tabs one line high filling it, never wrapping or
 * overflowing the panel, each tab as wide as its content (label not truncated unless it is at the
 * 240 px cap or the strip compressed it), the active tab underlined with no fill.
 */
function assertRail(context: string) {
  const row = rail();
  assert(row, `${context}: the tab rail renders.`);
  const railRect = row.getBoundingClientRect();
  assert(
    Math.abs(railRect.height - 32) <= 0.5,
    `${context}: rail is 32px (got ${railRect.height}).`,
  );
  const tablist = row.querySelector<HTMLElement>('[role="tablist"]');
  assert(tablist, `${context}: the strip (not the switcher) renders.`);
  const tops = new Set<number>();
  for (const tab of tabs()) {
    const rect = tab.getBoundingClientRect();
    tops.add(Math.round(rect.top));
    assert(
      rect.height <= 31.5 && rect.height >= 30.5,
      `${context}: a tab fills the rail (got ${rect.height}).`,
    );
    assert(rect.right <= railRect.right + 0.5, `${context}: tabs stay inside the rail.`);
    const style = getComputedStyle(tab);
    assert(style.whiteSpace === 'nowrap', `${context}: tab labels never wrap.`);
    if (tab.getAttribute('aria-selected') === 'true') {
      assert(
        style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
          style.borderBottomWidth === '2px' &&
          style.borderBottomColor !== 'rgba(0, 0, 0, 0)',
        `${context}: the active tab is marked by its underline only (bg ${style.backgroundColor}).`,
      );
    } else {
      assert(
        style.borderBottomColor === 'rgba(0, 0, 0, 0)',
        `${context}: an inactive tab has no underline.`,
      );
    }
  }

  assert(tops.size === 1, `${context}: all tabs sit on one line (tops ${[...tops].join(', ')}).`);
  const panel = secondary()!;
  assert(
    panel.scrollWidth <= panel.clientWidth + 1,
    `${context}: nothing widens the Secondary (${panel.scrollWidth} > ${panel.clientWidth}).`,
  );
}

/** The visible label halves of a tab (`MiddleTruncate`), to tell whether it is cut. */
function labelTruncated(tab: HTMLElement) {
  const head = tab.querySelector<HTMLElement>('[aria-hidden="true"].text-ellipsis');

  return Boolean(head && (head.scrollWidth > head.clientWidth + 0.5 || head.nextElementSibling));
}

function primaryHeaderRow() {
  const header = document.querySelector<HTMLElement>(
    '[data-workspace-surface="primary"] [data-workspace-header="true"]',
  );
  const row = header?.closest<HTMLElement>('.h-14');
  assert(row, 'The Primary header row renders.');

  return row;
}

/** Rail and content geometry of the Secondary: what must not move when another tab opens. */
function secondaryGeometry() {
  const row = rail();
  const panel = secondary()?.querySelector<HTMLElement>('[role="tabpanel"]');
  assert(row && panel, 'The Secondary shows its tab rail and tab panel.');
  const railRect = row.getBoundingClientRect();

  return {
    railTop: railRect.top,
    railHeight: railRect.height,
    contentTop: panel.getBoundingClientRect().top,
  };
}

async function historyDrill(userEvent: UserEvent, width: number | 'half') {
  // Context alone is already a tab on the rail: opening Work history moves nothing.
  await waitFor(() => tabNamed('Context'), 'The pinned Context shows as the one tab of the rail.');
  assert(tabs().length === 1, 'Only the pinned Context tab is open.');
  assert(
    !secondary()!.querySelector('button[aria-label^="Close"]'),
    'Context alone has no close: neither on its tab nor a panel close in the rail.',
  );
  const before = secondaryGeometry();
  assert(Math.abs(before.railHeight - 32) <= 0.5, `Context alone: the rail is 32px.`);
  await press(userEvent, 'Open history');
  await waitFor(() => tabNamed('Work history'), 'The Work history tab opens.');
  const after = secondaryGeometry();
  assert(
    Math.abs(after.railTop - before.railTop) <= 0.5 &&
      Math.abs(after.railHeight - before.railHeight) <= 0.5 &&
      Math.abs(after.contentTop - before.contentTop) <= 0.5,
    `Opening Work history keeps rail and content in place (${JSON.stringify(before)} -> ${JSON.stringify(after)}).`,
  );
  if (width !== 'half') {
    await setSecondaryWidth(userEvent, width);
  }

  const context = `${width === 'half' ? '50/50' : `${width}px`} root`;
  assertRail(context);
  // Root view: only the tab bar, no local row.
  assert(backRow() === null && breadcrumbs() === null, `${context}: no back row at a tab root.`);
  const contextTab = tabNamed('Context')!;
  const historyTab = tabNamed('Work history')!;
  assert(
    !labelTruncated(contextTab) && !labelTruncated(historyTab),
    `${context}: labels are whole.`,
  );
  const contextWidth = contextTab.getBoundingClientRect().width;
  const historyWidth = historyTab.getBoundingClientRect().width;
  assert(
    contextWidth < historyWidth && historyWidth < 180,
    `${context}: tabs follow their content (Context ${contextWidth}, Work history ${historyWidth}).`,
  );

  // Drill into one action from a scrolled list.
  const list = secondary()!.querySelector<HTMLElement>(
    '[data-history-scroll] .scroll-area-viewport',
  )!;
  list.scrollTop = 400;
  await frames();
  await press(userEvent, 'Read file module-20.ts');
  const row = await waitFor(backRow, `${context}: the detail shows the back row.`);
  assert(breadcrumbs() === null, `${context}: a one-level drill has no breadcrumb trail.`);
  const button = row.querySelector('button')!;
  assert(button.textContent === 'Back to Work history', `${context}: the row names the parent.`);
  assert(
    !row.textContent?.includes('module-20'),
    `${context}: the row does not repeat the action title shown right below it.`,
  );
  const heading = secondary()!.querySelector('[data-action-detail] h2');
  assert(heading?.textContent === 'Read file module-20.ts', `${context}: the detail names itself.`);
  assert(tabNamed('Work history'), `${context}: the tab keeps its root name.`);
  const rowRect = row.getBoundingClientRect();
  const railRect = rail()!.getBoundingClientRect();
  const primaryHeader = primaryHeaderRow().getBoundingClientRect();
  assert(
    Math.abs(rowRect.height - 24) <= 0.5,
    `${context}: back row is 24px (got ${rowRect.height}).`,
  );
  assert(
    Math.abs(rowRect.bottom - primaryHeader.bottom) <= 1 &&
      Math.abs(railRect.top - primaryHeader.top) <= 1,
    `${context}: rail + back row line up with the Primary header (${railRect.top}-${rowRect.bottom} vs ${primaryHeader.top}-${primaryHeader.bottom}).`,
  );
  assertRail(`${context} detail`);

  await userEvent.click(button);
  await waitFor(
    () => backRow() === null && secondary()!.querySelector('[data-history-scroll]'),
    `${context}: Back returns to the history root.`,
  );
  assert(
    tabNamed('Work history')?.getAttribute('aria-selected') === 'true',
    `${context}: same tab.`,
  );
  // Reported, not asserted: Back remounts the root screen (secondary-navigation.md: earlier entries
  // retain identifiers but remount), so its scroll is whatever the product keeps.
  const rootScroll = secondary()!.querySelector<HTMLElement>(
    '[data-history-scroll] .scroll-area-viewport',
  )!.scrollTop;
  console.info(
    `[local-nav] ${context}: secondary ${secondary()!.getBoundingClientRect().width}px, tabs Context ${contextWidth}px / Work history ${historyWidth}px, rail ${railRect.height}px + back row ${rowRect.height}px, root scroll before ${400} after Back ${rootScroll}`,
  );
}

// --- Stories ---------------------------------------------------------------------------------

export const HistoryDrillAt330: Story = {
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: ({ userEvent }) => historyDrill(userEvent, 330),
};

export const HistoryDrillAt450: Story = {
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: ({ userEvent }) => historyDrill(userEvent, 450),
};

export const HistoryDrillAtHalf: Story = {
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: ({ userEvent }) => historyDrill(userEvent, 'half'),
};

/** An opted-in stack shows its whole trail; it collapses below 480 px but keeps root, parent way back and current. */
export const DeepTasksBreadcrumbs: Story = {
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ userEvent }) => {
    await press(userEvent, 'Open tasks');
    await press(userEvent, 'Open TASK-03');
    await press(userEvent, 'Open attempt 2');
    await press(userEvent, 'Open review');
    await waitFor(() => document.querySelector('[data-review-detail]'), 'Review opens.');

    const trail = await waitFor(breadcrumbs, 'An opted-in stack shows the breadcrumb row.');
    assert(backRow() === null, 'Breadcrumb mode replaces the back row.');
    const segments = () => [...trail.querySelectorAll('li')].map((item) => item.textContent);
    assert(
      segments().join(' › ') === 'Tasks › TASK-03 › Attempt 2 › Review',
      `Wide: every level shows (got ${segments().join(' › ')}).`,
    );
    assert(
      Math.abs(trail.getBoundingClientRect().height - 24) <= 0.5,
      'The breadcrumb row is 24px.',
    );

    await setSecondaryWidth(userEvent, 330);
    const narrow = breadcrumbs()!;
    const visible = [...narrow.querySelectorAll('li')].map((item) => item.textContent);
    assert(
      visible[0] === 'Tasks' && visible.at(-1) === 'Review' && visible.length === 3,
      `330px: root, … and current show (got ${visible.join(' | ')}).`,
    );
    assert(
      narrow.querySelector('button[aria-label="Back to Attempt 2"]') !== null,
      '330px: the one-level Back to the direct parent stays.',
    );
    assertRail('330px breadcrumbs');

    await userEvent.click(
      [...narrow.querySelectorAll('button')].find((b) => b.textContent === 'Tasks')!,
    );
    await waitFor(
      () => breadcrumbs() === null && buttonNamed('Open TASK-03'),
      'The root segment returns to the list.',
    );
  },
};

/** A long name truncates at the 240 px cap; many tabs never wrap and overflow into the Opened menu. */
export const LongAndManyTabs: Story = {
  globals: { viewport: { value: 'w1440', isRotated: false } },
  play: async ({ userEvent }) => {
    await press(userEvent, 'Open long tab');
    await waitFor(() => tabNamed(longLabel), 'The long tab opens.');
    const longTab = tabNamed(longLabel)!;
    const longWidth = longTab.getBoundingClientRect().width;
    assert(
      Math.abs(longWidth - 240) <= 1,
      `A long label stops at the 240px cap (got ${longWidth}).`,
    );
    assert(
      labelTruncated(longTab),
      'The capped long label is truncated, its full name in the tab name.',
    );
    assertRail('long tab');

    await press(userEvent, 'Open many tabs');
    await setSecondaryWidth(userEvent, 450);
    const trigger = await waitFor(
      () =>
        [...rail()!.querySelectorAll<HTMLElement>('button')].find((button) =>
          button.querySelector('.sr-only')?.textContent?.startsWith('Opened items'),
        ),
      '450px with 8 tabs: the overflow trigger shows.',
    );
    assert(
      trigger.querySelector('.sr-only')?.textContent === 'Opened items (8)',
      'It counts every tab.',
    );
    assert(tabs().length < 8, 'Some tabs moved to the Opened menu.');
    assert(
      tabs().some((tab) => tab.getAttribute('aria-selected') === 'true'),
      'The active tab stays visible.',
    );
    assertRail('450px many tabs');
    assert(
      trigger.getBoundingClientRect().right <= rail()!.getBoundingClientRect().right + 0.5,
      'The overflow trigger stays inside the rail.',
    );
  },
};

async function mobileDrill(userEvent: UserEvent, width: number) {
  assert(window.innerWidth === width, `Expected a ${width}px viewport, got ${window.innerWidth}.`);
  await press(userEvent, 'Open history');
  await waitFor(
    () => secondary()?.querySelector('[data-history-scroll]'),
    'History opens stacked.',
  );
  await frames(20);
  await press(userEvent, 'Read file module-0.ts');
  await waitFor(() => secondary()?.querySelector('[data-action-detail]'), 'The detail opens.');
  await frames(20);
  assert(document.querySelector('[data-layout="stacked"]'), `${width}px: stacked layout.`);
  assert(rail() === null, `${width}px: no tab rail.`);
  assert(
    backRow() === null && breadcrumbs() === null,
    `${width}px: no back row or breadcrumbs under the header (header Back only).`,
  );
  // System Back sits in the header row next to the screen's header content.
  const headerRow = secondary()!.querySelector('[data-workspace-header="true"]')?.parentElement
    ?.parentElement;
  assert(
    headerRow?.querySelector('button[aria-label^="Back"]'),
    `${width}px: the header keeps Back.`,
  );
  const panel = secondary()!;
  assert(panel.scrollWidth <= panel.clientWidth + 1, `${width}px: no horizontal overflow.`);
}

export const MobileHeaderBackOnly390: Story = {
  globals: { viewport: { value: 'w390', isRotated: false } },
  play: ({ userEvent }) => mobileDrill(userEvent, 390),
};

export const MobileHeaderBackOnly360: Story = {
  globals: { viewport: { value: 'w360', isRotated: false } },
  play: ({ userEvent }) => mobileDrill(userEvent, 360),
};
