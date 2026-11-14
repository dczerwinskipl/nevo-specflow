import type { Meta, StoryObj } from '@storybook/react-vite';
import { DocsSearchMock, TriggerBoard, type TriggerCase } from './DocsSearchMock.stories-support';
import {
  repoAiOff,
  repoAiOn,
  repoErrorsOff,
  repoErrorsOn,
  worktreeAiOff,
} from './searchAnswers.stories-support';
import {
  longWorktreeWorkspace,
  repoWorkspace,
  unavailableWorkspace,
  workspaceList,
  worktreeWorkspace,
} from './workspaces.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for "Search results refinement (proposal)" in
 * docs/product/specflow/ui/documentation-reader.md). Not production code: static live answers, no
 * routing, no backend. Every story pins one frame (390 x 844 mobile, 1440 x 900 desktop).
 * No Chromatic snapshots, no interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Documentation search results (mock)',
  component: DocsSearchMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: {
    variant: 'after',
    width: 390,
    height: 844,
    workspaces: workspaceList(),
    selectedWorkspaceId: repoWorkspace.workspaceId,
    answer: repoAiOff,
  },
} satisfies Meta<typeof DocsSearchMock>;
export default meta;
type Story = StoryObj<typeof meta>;

const worktree = { selectedWorkspaceId: worktreeWorkspace.workspaceId, answer: worktreeAiOff };

/* 1. Before / after at 390: the project folder (dirty) and the worktree */
export const BeforeRepo390: Story = { tags: ['capture'], args: { variant: 'before' } };
export const AfterRepo390: Story = { tags: ['capture'] };
export const BeforeWorktree390: Story = {
  tags: ['capture'],
  args: { variant: 'before', ...worktree },
};
export const AfterWorktree390: Story = { tags: ['capture'], args: worktree };

/* 2. Highlights and a section path that is not the title (a proposal's "Claude-family errors") */
export const BeforeHighlightsProposalsOn390: Story = {
  tags: ['capture'],
  args: { variant: 'before', answer: repoErrorsOn },
};
export const AfterHighlightsProposalsOn390: Story = {
  tags: ['capture'],
  args: { answer: repoErrorsOn },
};
export const AfterProposalsOff390: Story = { tags: ['capture'], args: { answer: repoErrorsOff } };
export const AfterProposalsOnAi390: Story = { tags: ['capture'], args: { answer: repoAiOn } };

/* 3. Sticky search: scrolled, and with the on-screen keyboard open */
export const BeforeScrolled390: Story = {
  tags: ['capture'],
  args: { variant: 'before', scrolled: 360 },
};
export const AfterScrolled390: Story = { tags: ['capture'], args: { scrolled: 360 } };
export const AfterKeyboard390: Story = {
  tags: ['capture'],
  args: { scrolled: 88, keyboard: 336 },
};

/* 4. Empty states (assuming the relevance cutoff the backend still owes) */
export const AfterNoMatches390: Story = { tags: ['capture'], args: { empty: 'no-match' } };
export const AfterOnlyProposals390: Story = {
  tags: ['capture'],
  args: { empty: 'only-proposals' },
};

/* 5. Stress: a 98-character worktree name, long titles, the popover */
const long = {
  workspaces: workspaceList([longWorktreeWorkspace, unavailableWorkspace]),
  selectedWorkspaceId: longWorktreeWorkspace.workspaceId,
  answer: repoErrorsOn,
};
export const BeforeLongName390: Story = { tags: ['capture'], args: { variant: 'before', ...long } };
export const AfterLongName390: Story = { tags: ['capture'], args: long };
export const AfterLongNamePopover390: Story = {
  tags: ['capture'],
  args: { ...long, pickerOpen: true },
};

/* 6. Desktop regression at 1440 */
export const BeforeDesktop1440: Story = {
  tags: ['capture'],
  args: {
    variant: 'before',
    width: 1440,
    height: 900,
    activeId: 'architecture.ai.provider-boundary',
  },
};
export const AfterDesktop1440: Story = {
  tags: ['capture'],
  args: { width: 1440, height: 900, activeId: 'architecture.ai.provider-boundary' },
};

/* 7. The shared trigger: the Specification switcher beside the workspace picker */
const specLabel = 'Bieżąca specyfikacja';
const workspaceLabel = 'Obszar roboczy';
const cases: readonly TriggerCase[] = [
  {
    title: 'Specification switcher (drawer), with a key',
    label: specLabel,
    name: 'Workspace-aware documentation reader',
    before: [{ text: 'DOC-143' }],
    after: [{ text: 'DOC-143' }],
  },
  {
    title: 'Specification switcher, long title',
    label: specLabel,
    name: 'Workspace-aware documentation reader with search refinement for mobile review',
    before: [{ text: 'DOC-143' }],
    after: [{ text: 'DOC-143' }],
  },
  {
    title: 'Project folder, local changes',
    label: workspaceLabel,
    name: 'repo',
    before: [
      { text: 'Katalog projektu' },
      { text: 'Uwzględnia niezatwierdzone zmiany', tone: 'muted' },
    ],
    after: [{ text: 'Katalog projektu' }, { text: 'Zmiany lokalne' }],
  },
  {
    title: 'Project folder, clean',
    label: workspaceLabel,
    name: 'repo',
    before: [{ text: 'Katalog projektu' }],
    after: [{ text: 'Katalog projektu' }],
  },
  {
    title: 'Project folder from a Session',
    label: workspaceLabel,
    name: 'repo',
    before: [
      { text: 'Katalog projektu · obszar roboczy tej sesji' },
      { text: 'Uwzględnia niezatwierdzone zmiany', tone: 'muted' },
    ],
    after: [
      { text: 'Katalog projektu' },
      { text: 'obszar roboczy tej sesji' },
      { text: 'Zmiany lokalne' },
    ],
  },
  {
    title: 'Worktree bound to a Specification',
    label: workspaceLabel,
    name: 'test-dogfooding-docs',
    before: [{ text: 'Worktree · Test dogfooding docs' }],
    after: [{ text: 'Worktree' }, { text: 'Test dogfooding docs' }],
  },
  {
    title: 'Worktree, 98-character name, local changes',
    label: workspaceLabel,
    name: longWorktreeWorkspace.name,
    before: [
      { text: `Worktree · ${longWorktreeWorkspace.specifications[0]!.title}` },
      { text: 'Uwzględnia niezatwierdzone zmiany', tone: 'muted' },
    ],
    after: [
      { text: 'Worktree' },
      { text: 'Zmiany lokalne' },
      { text: longWorktreeWorkspace.specifications[0]!.title },
    ],
  },
  {
    title: 'Unavailable worktree (an explicit pick)',
    label: workspaceLabel,
    name: 'spike-provider-limits',
    before: [{ text: 'Worktree' }],
    after: [{ text: 'Worktree' }, { text: 'Katalog niedostępny', tone: 'attention' }],
  },
];

export const TriggerComparison: StoryObj<typeof TriggerBoard> = {
  tags: ['capture'],
  render: () => <TriggerBoard cases={cases} />,
};
