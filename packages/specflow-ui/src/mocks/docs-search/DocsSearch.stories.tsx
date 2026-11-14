import type { Meta, StoryObj } from '@storybook/react-vite';
import { DocsSearchMock, TriggerBoard, type TriggerCase } from './DocsSearchMock.stories-support';
import {
  repoAiOff,
  repoAiOn,
  repoErrorsOff,
  repoErrorsOn,
  repoNonsense,
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
const clean = { workspaces: workspaceList([], { ...repoWorkspace, dirty: false }) };

/* 1. Before / after at 390: the project folder (local changes and clean) and the worktree */
export const BeforeRepo390: Story = { tags: ['capture'], args: { variant: 'before' } };
export const AfterRepo390: Story = { tags: ['capture'] };
export const AfterRepoClean390: Story = { tags: ['capture'], args: clean };
export const BeforeWorktree390: Story = {
  tags: ['capture'],
  args: { variant: 'before', ...worktree },
};
export const AfterWorktree390: Story = { tags: ['capture'], args: worktree };

/* 2. Result rows: paths, excerpts and highlights; proposals off and on */
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
  args: { scrolled: 84, keyboard: 336 },
};

/* 4. No word match: works without a relevance cutoff (hybrid), and the empty states (lexical) */
export const AfterMeaningOnly390: Story = { tags: ['capture'], args: { answer: repoNonsense } };
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
const localChanges = { text: 'Zmiany lokalne', tone: 'attention' } as const;
const cases: readonly TriggerCase[] = [
  {
    title: 'Specification switcher (drawer), with a key',
    label: 'Bieżąca specyfikacja',
    name: 'Workspace-aware documentation reader',
    before: [{ text: 'DOC-143' }],
    after: [{ text: 'DOC-143' }],
  },
  {
    title: 'Specification switcher, long title',
    label: 'Bieżąca specyfikacja',
    name: 'Workspace-aware documentation reader with search refinement for mobile review',
    before: [{ text: 'DOC-143' }],
    after: [{ text: 'DOC-143' }],
  },
  {
    title: 'Project folder, local changes',
    label: 'Obszar roboczy',
    name: 'repo',
    before: [
      { text: 'Katalog projektu' },
      { text: 'Uwzględnia niezatwierdzone zmiany', tone: 'muted' },
    ],
    after: [{ text: 'Katalog projektu' }],
    status: localChanges,
  },
  {
    title: 'Project folder, clean',
    label: 'Obszar roboczy',
    name: 'repo',
    before: [{ text: 'Katalog projektu' }],
    after: [{ text: 'Katalog projektu' }],
  },
  {
    title: 'Project folder from a Session, local changes',
    label: 'Obszar roboczy',
    name: 'repo',
    before: [
      { text: 'Katalog projektu · obszar roboczy tej sesji' },
      { text: 'Uwzględnia niezatwierdzone zmiany', tone: 'muted' },
    ],
    after: [{ text: 'Katalog projektu' }, { text: 'obszar roboczy tej sesji' }],
    status: localChanges,
  },
  {
    title: 'Worktree bound to a Specification',
    label: 'Obszar roboczy',
    name: 'test-dogfooding-docs',
    before: [{ text: 'Worktree · Test dogfooding docs' }],
    after: [{ text: 'Worktree' }, { text: 'Test dogfooding docs' }],
  },
  {
    title: 'Worktree, 98-character name, local changes',
    label: 'Obszar roboczy',
    name: longWorktreeWorkspace.name,
    before: [
      { text: `Worktree · ${longWorktreeWorkspace.specifications[0]!.title}` },
      { text: 'Uwzględnia niezatwierdzone zmiany', tone: 'muted' },
    ],
    after: [{ text: 'Worktree' }, { text: longWorktreeWorkspace.specifications[0]!.title }],
    status: localChanges,
  },
  {
    title: 'Unavailable worktree (an explicit pick)',
    label: 'Obszar roboczy',
    name: 'spike-provider-limits',
    before: [{ text: 'Worktree' }],
    after: [{ text: 'Worktree' }],
    status: { text: 'Katalog niedostępny', tone: 'danger' },
  },
];

export const TriggerComparison: StoryObj<typeof TriggerBoard> = {
  tags: ['capture'],
  render: () => <TriggerBoard cases={cases} />,
};

const casesEn: readonly TriggerCase[] = [
  {
    title: 'Specification switcher, long title',
    label: 'Current specification',
    name: 'Workspace-aware documentation reader with search refinement for mobile review',
    before: [{ text: 'DOC-143' }],
    after: [{ text: 'DOC-143' }],
  },
  {
    title: 'Project folder, local changes',
    label: 'Workspace',
    name: 'repo',
    before: [
      { text: 'Project folder' },
      { text: 'Uncommitted changes are included', tone: 'muted' },
    ],
    after: [{ text: 'Project folder' }],
    status: { text: 'Local changes', tone: 'attention' },
  },
  {
    title: 'Project folder, clean',
    label: 'Workspace',
    name: 'repo',
    before: [{ text: 'Project folder' }],
    after: [{ text: 'Project folder' }],
  },
  {
    title: 'Worktree, 98-character name, local changes',
    label: 'Workspace',
    name: longWorktreeWorkspace.name,
    before: [
      { text: `Worktree · ${longWorktreeWorkspace.specifications[0]!.title}` },
      { text: 'Uncommitted changes are included', tone: 'muted' },
    ],
    after: [{ text: 'Worktree' }, { text: longWorktreeWorkspace.specifications[0]!.title }],
    status: { text: 'Local changes', tone: 'attention' },
  },
  {
    title: 'Unavailable worktree (an explicit pick)',
    label: 'Workspace',
    name: 'spike-provider-limits',
    before: [{ text: 'Worktree' }],
    after: [{ text: 'Worktree' }],
    status: { text: 'Folder unavailable', tone: 'danger' },
  },
];

export const TriggerComparisonEn: StoryObj<typeof TriggerBoard> = {
  tags: ['capture'],
  render: () => <TriggerBoard cases={casesEn} locale="en" />,
};
