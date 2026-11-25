import { describe, expect, it, vi } from 'vitest';
import type { CurrentSpecWorkflow } from '@nevo/specflow-contracts/specs/overview';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { createSpecificationWorkspaceFixture } from '../../../../../test-support/specs/workspace/fixtures';
import {
  startReviewAttention,
  workflowFixtures,
} from '../../../../../test-support/specs/overview/fixtures';
import { createSpecFlowI18n } from '../../../../i18n/i18n';
import { translateMessage } from '../../../../i18n/message';
import { mapAttentionItem, type AttentionItem } from '../../../specs/read-model';
import { createFakeWorkspaceRuntime } from '../../../specs/workspace/WorkspaceContext';
import { taskAttentionEntry } from '../../contributions/specification-overview/attentionEntries';
import { attentionActionLabel } from '../../overview/attentionWording';
import { stepTrack } from '../presentation';
import { handoffView } from './handoffView';
import { situationOf } from './SpecificationSituation';

const { t } = createSpecFlowI18n('en');
const locale = 'en';
const now = (projection: Pick<WorkflowActionProjection, 'outline' | 'position'>) =>
  stepTrack(t, projection);
const outline = (position: number, title: string) => ({
  stepCount: 7,
  current: { step: `step-${position}`, title, position },
});
const owner = {
  class: 'human',
  details: { actorId: 'runtime:trusted-local', trust: 'local' },
} as const;

/**
 * The same state as the Specifications list carries it and as the Overview's Now projection has it:
 * the row must say what the Now says (its step, its place among the steps, its wording).
 */
const states: readonly {
  readonly name: string;
  readonly list: CurrentSpecWorkflow;
  readonly projection: Pick<WorkflowActionProjection, 'outline' | 'position' | 'handoff'>;
  readonly title: string;
  readonly detail?: string;
}[] = [
  {
    name: 'not started',
    list: workflowFixtures.notStarted,
    projection: {
      outline: { stepCount: 7 },
      position: {
        kind: 'not-started',
        preview: {
          workflowId: 'feature',
          version: 3,
          revision: 'rev',
          title: 'Feature specification',
          firstStepTitle: 'Gather requirements',
          steps: [],
        },
      } as unknown as WorkflowActionProjection['position'],
    },
    title: 'Not started',
  },
  {
    name: 'an agent working',
    list: workflowFixtures.agentWorking,
    projection: {
      outline: outline(4, 'Break the solution down'),
      position: {
        kind: 'active',
        step: { id: 'breakdown', title: 'Break the solution down', kind: 'work', purpose: '' },
        attempt: workflowFixtures.agentWorking.attempt,
      } as WorkflowActionProjection['position'],
    },
    title: 'Break the solution down',
  },
  {
    name: 'changes requested',
    list: workflowFixtures.changesRequested,
    projection: {
      outline: outline(4, 'Break the solution down'),
      position: {
        kind: 'ready',
        next: { step: { id: 'breakdown', title: 'Break the solution down', kind: 'work' } },
      } as unknown as WorkflowActionProjection['position'],
      handoff: workflowFixtures.changesRequested.handoff,
    },
    title: 'Break the solution down',
    detail: 'Changes requested',
  },
  {
    name: 'waiting for Tasks',
    list: workflowFixtures.waiting,
    projection: {
      outline: outline(6, 'Waiting for Tasks'),
      position: {
        kind: 'waiting',
        step: { id: 'wait', title: 'Waiting for Tasks', kind: 'wait', purpose: '' },
        blockingTasks: { count: 12, ids: [] },
        totalTasks: 12,
      },
    },
    title: 'Waiting for Tasks',
    // The Now's Task progress side text for the same count.
    detail: t('taskOverview.progress.readyToStart', { count: 5 }),
  },
  {
    name: 'completed',
    list: workflowFixtures.completed,
    projection: {
      outline: { stepCount: 7 },
      position: { kind: 'terminal', outcome: 'completed' },
    },
    title: 'Completed',
  },
  {
    name: 'abandoned',
    list: workflowFixtures.abandoned,
    projection: {
      position: {
        kind: 'terminal',
        outcome: 'abandoned',
        abandonment: { at: '2026-11-20T15:40:00Z', reason: 'Not needed.', actor: owner },
      },
    },
    title: 'Abandoned',
  },
];

describe('a Specifications list row and the Overview say the same', () => {
  it.each(states)('$name', ({ list, projection, title, detail }) => {
    const situation = situationOf(t, list, { locale });
    expect(situation.title).toBe(title);
    if (list.kind === 'ended') {
      // A finished row says it ended; it draws no step track.
      expect(situation.track).toBeUndefined();
    } else {
      expect(situation.track).toEqual(now(projection));
    }

    if (detail !== undefined) {
      expect(situation.detail).toBe(detail);
    }

    if (projection.handoff) {
      expect(situation.detail).toBe(handoffView(t, projection.handoff, { locale }).outcome);
    }
  });

  it('says when an abandoned run was abandoned, in the Now’s words for the time', () => {
    const situation = situationOf(t, workflowFixtures.abandoned, { locale });
    expect(situation.dateTime).toBe('2026-11-20T15:40:00Z');
    expect(situation.detail).toBeTruthy();
  });

  it('leads with the action of the attention item the Overview lists first', () => {
    const first = mapAttentionItem(startReviewAttention.first);
    const situation = situationOf(t, workflowFixtures.readyForNextStep, {
      locale,
      attention: { first, count: 2 },
    });
    // The Overview's wording of the action; its Now's Start offers it there.
    expect(situation.title).toBe('Start Review the breakdown');
    expect(situation.title).toBe(
      translateMessage(t, attentionActionLabel('start-step', first), locale),
    );
    expect(situation.track?.label).toBe('Step 5 of 7');
    expect(situation.detail).toBe('1 more item requires attention');
    expect(situation.tone).toBe('attention');
  });

  it('names the Task of a Task item and reads its facts with the Overview’s titles', () => {
    const resume = situationOf(t, workflowFixtures.waiting, {
      locale,
      attention: { first: resumeItem, count: 1 },
    });
    expect(resume.title).toBe('Resume · API');
    // The same label as the Overview's Requires attention button for the item.
    expect(resume.title.startsWith(translateMessage(t, overviewLabel(resumeItem), locale))).toBe(
      true,
    );
    expect(resume.detail).toBeUndefined();

    // Archetype configuration has no flow on the Overview: its reason leads.
    const configure = situationOf(t, workflowFixtures.readyForNextStep, {
      locale,
      attention: {
        first: {
          id: 'specification-attention',
          kind: 'specification',
          title: 'Review the breakdown',
          reason: 'Choose a model for the reviewer.',
          actionLabel: '',
          code: 'model-missing',
          action: 'configure-archetype',
        },
        count: 1,
      },
    });
    expect(configure.title).toBe('Choose a model for the reviewer.');
  });
});

const resumeItem: AttentionItem = {
  id: 'task-attention.api',
  kind: 'task',
  title: 'API',
  reason: 'display only',
  actionLabel: '',
  targetId: 'api',
  code: 'on-hold-blocking',
  action: 'resume-task',
};

/** The Overview's Requires attention action label of the same item. */
function overviewLabel(item: AttentionItem) {
  const entry = taskAttentionEntry(item, {
    specId: 'sso',
    data: createSpecificationWorkspaceFixture('working', 'sso'),
    actions: createFakeWorkspaceRuntime({ openTask: vi.fn(), openTasks: vi.fn() }),
  });

  return entry.action!.label;
}
