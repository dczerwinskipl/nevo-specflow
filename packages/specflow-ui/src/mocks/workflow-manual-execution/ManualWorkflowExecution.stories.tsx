import type { Meta, StoryObj } from '@storybook/react-vite';
import { SpecificationMock, type SpecificationScenario } from './SpecificationMock.stories-support';
import { TaskMock, type TaskScenario } from './TaskMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (docs/ideas/specflow-engine/reusable-workflow-manual-execution/ux-contract.md).
 * Not production code: static fixtures, no routing, no backend (task.md uses the real Documents
 * editor with a stubbed save). Each story pins one frame width (1440 wide, 900 compact, 390 narrow).
 * No Chromatic snapshots, no interaction tests.
 */

interface MockArgs {
  screen: 'specification' | 'task';
  specification: SpecificationScenario;
  task: TaskScenario;
  documentPlacement: 'secondary' | 'primary';
  historyOpen: boolean;
  width: number;
  height: number;
}

function ManualWorkflowMock(args: MockArgs) {
  return args.screen === 'specification' ? (
    <SpecificationMock
      width={args.width}
      height={args.height}
      scenario={args.specification}
      historyOpen={args.historyOpen}
    />
  ) : (
    <TaskMock
      width={args.width}
      height={args.height}
      scenario={args.task}
      documentPlacement={args.documentPlacement}
      historyOpen={args.historyOpen}
    />
  );
}

const meta = {
  title: 'SpecFlow/Screens/Manual workflow execution (mock)',
  component: ManualWorkflowMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: {
    screen: 'specification',
    specification: 'waiting',
    task: 'rework',
    documentPlacement: 'secondary',
    historyOpen: false,
    width: 1440,
    height: 900,
  },
} satisfies Meta<typeof ManualWorkflowMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The Default: the Specification waiting for its Tasks; Controls switch screen, state and frame. */
export const Default: Story = {
  argTypes: {
    screen: { control: 'inline-radio', options: ['specification', 'task'] },
    specification: {
      control: 'select',
      options: [
        'empty',
        'authoring',
        'create-task',
        'breakdown',
        'finish-breakdown',
        'waiting',
        'close-blocked',
        'close-ready',
        'abandon',
        'abandon-blocked',
        'abandoned',
        'close-after-abandon',
      ],
    },
    task: {
      control: 'select',
      options: [
        'draft',
        'first-start',
        'start-definition-changed',
        'start-type-not-allowed',
        'start-changed-since-preview',
        'waiting',
        'rework',
        'finish-review-failed',
        'finish-feedback-missing',
        'return',
        'on-hold',
        'cancelled',
        'done',
        'edit-details',
        'edit-conflict',
        'edit-document',
        'author',
        'author-add-menu',
        'author-add-spec-doc',
        'author-add-project-doc',
        'author-add-path',
        'author-row-menu',
        'author-dependencies',
        'author-with-document',
        'approve-missing-context',
        'long-title',
      ],
    },
    documentPlacement: { control: 'inline-radio', options: ['secondary', 'primary'] },
    historyOpen: { control: 'boolean' },
    width: { control: { type: 'number', min: 320, max: 1920, step: 10 } },
    height: { control: { type: 'number', min: 360, max: 1600, step: 10 } },
  },
};

const spec = (scenario: SpecificationScenario, extra: Partial<MockArgs> = {}): Story => ({
  tags: ['capture'],
  args: { screen: 'specification', specification: scenario, ...extra },
});
const taskStory = (scenario: TaskScenario, extra: Partial<MockArgs> = {}): Story => ({
  tags: ['capture'],
  args: { screen: 'task', task: scenario, ...extra },
});

/* 1. Specification: Tasks and the Specification workflow */
export const SpecEmptyWide = spec('empty');
export const SpecAuthoringWide = spec('authoring');
export const SpecCreateTaskWide = spec('create-task', { height: 1100 });
export const SpecBreakdownWide = spec('breakdown');
export const SpecFinishBreakdownWide = spec('finish-breakdown');
export const SpecWaitingWide = spec('waiting', { height: 1200 });
export const SpecWaitingCompact900 = spec('waiting', { width: 900, height: 1200 });
export const SpecWaitingNarrow390 = spec('waiting', { width: 390, height: 1500 });
export const SpecAuthoringNarrow390 = spec('authoring', { width: 390, height: 1100 });

/* 4. Close */
export const SpecCloseBlockedWide = spec('close-blocked', { height: 1000 });
export const SpecCloseReadyWide = spec('close-ready');
export const SpecCloseBlockedNarrow390 = spec('close-blocked', { width: 390, height: 900 });

/* 4b. Abandon (close without realization) */
export const SpecAbandonWide = spec('abandon', { height: 1000 });
export const SpecAbandonBlockedWide = spec('abandon-blocked');
export const SpecAbandonedWide = spec('abandoned', { height: 1100 });
export const SpecCloseAfterAbandonWide = spec('close-after-abandon', { height: 1000 });

/* 2. Task detail: lifecycle and details */
export const TaskDraftWide = taskStory('draft');
export const TaskOnHoldWide = taskStory('on-hold');
export const TaskCancelledWide = taskStory('cancelled');
export const TaskDoneWide = taskStory('done');
export const TaskEditDetailsWide = taskStory('edit-details', { height: 1000 });
export const TaskEditConflictWide = taskStory('edit-conflict', { height: 1000 });
/** A/B — A: task.md in the Secondary next to the Task (recommended). */
export const TaskDocumentSecondaryWide = taskStory('edit-document');
/** A/B — B: task.md replaces the Task page, Back returns (Narrow always looks like this). */
export const TaskDocumentPrimaryWide = taskStory('edit-document', { documentPlacement: 'primary' });
export const TaskDocumentCompact900 = taskStory('edit-document', { width: 900 });
export const TaskDocumentNarrow390 = taskStory('edit-document', { width: 390, height: 844 });

/* 3. Task workflow step panel */
export const TaskFirstStartWide = taskStory('first-start');
export const TaskStartDefinitionChangedWide = taskStory('start-definition-changed');
export const TaskStartTypeNotAllowedWide = taskStory('start-type-not-allowed');
/** Confirm sent the previewed revision; it changed meanwhile, so nothing started. */
export const TaskStartChangedSincePreviewWide = taskStory('start-changed-since-preview');
export const TaskWaitingWide = taskStory('waiting');
export const TaskFinishReviewFailedWide = taskStory('finish-review-failed', { height: 1000 });
export const TaskFinishFeedbackMissingWide = taskStory('finish-feedback-missing', { height: 1000 });
export const TaskReworkWide = taskStory('rework');
export const TaskReturnWide = taskStory('return');
export const TaskReworkCompact900 = taskStory('rework', { width: 900 });
export const TaskReworkNarrow390 = taskStory('rework', { width: 390, height: 1100 });

/* 2b. Task authoring: documents, context and dependencies on the Task page */
export const TaskAuthorWide = taskStory('author', { height: 1700 });
export const TaskAuthorAddMenuWide = taskStory('author-add-menu', { height: 1200 });
export const TaskAuthorAddSpecDocWide = taskStory('author-add-spec-doc', { height: 1000 });
export const TaskAuthorAddProjectDocWide = taskStory('author-add-project-doc', { height: 1000 });
export const TaskAuthorAddPathWide = taskStory('author-add-path', { height: 1000 });
export const TaskAuthorRowMenuWide = taskStory('author-row-menu', { height: 1500 });
export const TaskAuthorDependenciesWide = taskStory('author-dependencies', { height: 1000 });
/** Context edited in the Primary while task.md and screens.md are open in the Secondary editor. */
export const TaskAuthorWithDocumentWide = taskStory('author-with-document', { height: 1200 });
export const TaskAuthorWithDocumentCompact900 = taskStory('author-with-document', {
  width: 900,
  height: 1200,
});
export const TaskAuthorNarrow390 = taskStory('author-with-document', { width: 390, height: 1950 });

/* 5. Now block follow-ups */
/** History opened with the header toggle (closed by default). */
export const SpecHistoryOpenWide = spec('waiting', { height: 1200, historyOpen: true });
export const TaskHistoryOpenWide = taskStory('rework', { historyOpen: true });
export const TaskApproveMissingContextWide = taskStory('approve-missing-context', { height: 1000 });
export const TaskLongTitleCompact900 = taskStory('long-title', { width: 900 });
